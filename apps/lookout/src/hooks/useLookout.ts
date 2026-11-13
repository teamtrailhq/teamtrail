import {
  type MapSummary,
  type MapSnapshot,
  type DecisionRecord,
  type ActivityState,
  type TrackerHealth,
  type SessionInfo,
  describeTrackerEvent,
  auditDecisions,
  activeTrails,
} from '@teamtrail/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createActions, TRAIL_LEAD, type Runtime, type Selection, isRunning } from '../lib';
import { newestWins } from '../lib/newestWins';
import { onStreamOpen } from '../lib/trackerChanges';
import { useLeases } from './useLeases';

/** What the trail lead reads when a change hit a file that moved on since it was loaded (httpFs.ts, 409). */
const STALE_WRITE =
  'That changed while you were on it, so nothing was written. It is reloaded now: look again, then redo the change.';

export function useLookout(rt: Runtime) {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [mapId, setMapIdState] = useState<string>();
  const [snap, setSnap] = useState<MapSnapshot>();
  /** Every trail, for the switcher and the cross-trail inbox. */
  const [allSnaps, setAllSnaps] = useState<Record<string, MapSnapshot>>({});
  /** Persisted decision records per trail. */
  const [records, setRecords] = useState<Record<string, DecisionRecord[]>>({});
  /** True after the first full read of the tracker. */
  const [loaded, setLoaded] = useState(false);
  const [activity, setActivity] = useState<ActivityState>(rt.activity.snapshot);
  const [health, setHealth] = useState<TrackerHealth>(rt.monitor.health);
  const leases = useLeases(rt);
  useEffect(() => rt.monitor.subscribe(setHealth), [rt]);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string>();
  /** Session whose conversation is open in the dock. */
  const [chatSession, setChatSession] = useState<string>();
  const mapIdRef = useRef<string>();
  /** Trail a connected agent just created; shown as soon as the tracker lists it. */
  const followRef = useRef<string>();
  const followed = useRef(new Set<string>());
  const snapRef = useRef<MapSnapshot>();
  snapRef.current = snap;

  const setMapId = useCallback((id: string | undefined) => {
    mapIdRef.current = id;
    setMapIdState(id);
    setSelection(null);
  }, []);

  // a refresh can start while another still loads: the older one never lands over the newer
  const [order] = useState(newestWins);
  const refresh = useCallback(async () => {
    const fresh = order.start();
    const list = await rt.adapter.listMaps();
    let id = mapIdRef.current;
    const follow = followRef.current;
    if (follow && list.some((m) => m.id === follow)) {
      followRef.current = undefined;
      id = follow;
      if (id !== mapIdRef.current) setMapId(id);
    } else if (!id || !list.some((m) => m.id === id)) {
      id = activeTrails(list)[0]?.id;
      setMapId(id);
    }
    const [snaps, recs] = await Promise.all([
      Promise.all(list.map((m) => rt.adapter.loadMap(m.id))),
      Promise.all(list.map((m) => rt.adapter.listDecisions(m.id))),
    ]);
    if (!fresh()) return;
    setMaps(list);
    setAllSnaps(Object.fromEntries(snaps.map((s) => [s.map.id, s])));
    setRecords(Object.fromEntries(list.map((m, i) => [m.id, recs[i]])));
    setLoaded(true);
    setSnap(snaps.find((s) => s.map.id === id));
  }, [rt, setMapId, order]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offT = () => {};
    let offA = () => {};
    let alive = true;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh().catch((e) => setError(String(e))), 40);
    };
    // changes made before the event stream opened (or while it reconnected) never arrive as events
    const offOpen = onStreamOpen(schedule);
    const agentWrote = (s: SessionInfo, mapId?: string) =>
      isRunning(s) && rt.activity.isRemote(s.id) && (!mapId || !s.mapId || s.mapId === mapId);
    const ticketById = (id: string) => snapRef.current?.tickets.find((t) => t.id === id);
    const onTrackerEvent = (e: Parameters<Parameters<typeof rt.adapter.subscribe>[0]>[0]) => {
      const line = describeTrackerEvent(e, ticketById);
      // Writes by a connected agent are already described in its own session feed.
      const byAgent =
        e.kind === 'external.changed' && rt.activity.snapshot.sessions.some((s) => agentWrote(s, e.mapId));
      const thisTrail = !('mapId' in e) || !e.mapId || e.mapId === mapIdRef.current || e.kind === 'map.created';
      if (line && !byAgent && thisTrail) rt.activity.push(line);
      schedule();
    };
    void rt.ready.then(() => {
      if (!alive) return;
      offT = rt.adapter.subscribe(onTrackerEvent);
      offA = rt.activity.subscribe(setActivity);
      rt.activity.push({
        source: 'system',
        level: 'ok',
        text: `Online · tracker ${rt.adapter.label.toLowerCase()} · ${rt.adapter.location}`,
      });
      void refresh().catch((e) => setError(String(e)));
    });
    return () => {
      alive = false;
      offT();
      offA();
      offOpen();
      clearTimeout(timer);
    };
  }, [rt, refresh]);

  // through refresh, so a load for the trail just opened never lands over a newer one
  useEffect(() => {
    if (mapId) void refresh().catch((e) => setError(String(e)));
  }, [mapId, refresh]);

  // A connected agent that charts a new trail brings the Lookout along.
  useEffect(() => {
    for (const s of activity.sessions) {
      if (s.mode !== 'chart' || !s.mapId || !rt.activity.isRemote(s.id) || followed.current.has(s.id)) continue;
      followed.current.add(s.id);
      if (s.status !== 'running' && Date.now() - (s.endedAt ?? 0) > 60_000) continue;
      followRef.current = s.mapId;
      void refresh().catch((e) => setError(String(e)));
    }
  }, [activity.sessions, rt, refresh]);

  // Never make the trail lead go looking: surface the oldest open question.
  const firstPending = activity.pending[0]?.sessionId;
  useEffect(() => {
    if (!firstPending) return;
    const isLive = (id?: string) => rt.activity.snapshot.sessions.some((s) => s.id === id && isRunning(s));
    setChatSession((cur) => (isLive(cur) ? cur : firstPending));
  }, [firstPending, rt]);

  const guard = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      rt.activity.push({ source: 'trail lead', agent: TRAIL_LEAD, level: 'warn', text: label });
      try {
        setError(undefined);
        await fn();
      } catch (e) {
        const stale = (e as { stale?: boolean }).stale === true;
        const msg = stale ? STALE_WRITE : ((e as Error).message ?? String(e));
        setError(msg);
        rt.activity.push({ source: 'trail lead', agent: TRAIL_LEAD, level: 'alert', text: `Rejected · ${msg}` });
        // the file moved on while this was being done: show it as it is now
        if (stale) void refresh().catch((err) => setError(String(err)));
      }
    },
    [rt, refresh],
  );

  const actions = useMemo(
    () => createActions({ rt, guard, setMapId, mapIdRef, snapRef, setChatSession, setSelection }),
    [guard, rt, setMapId],
  );

  /** Every trail's decisions, newest first, including derived entries for decided tickets without a record. */
  const decisions = useMemo(
    () =>
      Object.values(allSnaps)
        .flatMap((s) => auditDecisions(s, records[s.map.id] ?? []))
        .sort((a, b) => b.decidedAt - a.decidedAt),
    [allSnaps, records],
  );

  return {
    maps,
    allSnaps,
    mapId,
    snap,
    activity,
    health,
    selection,
    setSelection,
    error,
    chatSession,
    decisions,
    leases,
    loaded,
    actions,
  };
}

export type LookoutApi = ReturnType<typeof useLookout>;
