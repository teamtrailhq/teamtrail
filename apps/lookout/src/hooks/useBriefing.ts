import { type AttentionItem, type Briefing, buildBriefing, briefingLine } from '@teamtrail/core';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { type Runtime, type Prefs } from '../lib';
import { type AwayVisit, awayVisit } from '../lib/awayVisit';
import type { LookoutApi } from './useLookout';

export const TICK_MS = 15_000;

export const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/** Header button: `new` is a briefing not opened yet, `seen` can be reopened, `none` means no briefing this session. */
export type BriefingStatus = 'new' | 'seen' | 'none';

/**
 * "While you were away". While the tab is visible the trail lead was last present
 * at their last input; hiding the tab while active counts as present until then.
 * Presence marks every trail seen. Opening
 * the app, or coming back after being away longer than the threshold, shows a
 * briefing of what changed since each trail was last seen, unless nothing did.
 */
export function useBriefing(
  rt: Runtime,
  api: LookoutApi,
  prefs: Prefs['briefing'],
  /** The ranked attention queue, so "needs you" comes in the same order as Waiting on you. */
  attention?: AttentionItem[],
) {
  const [since, setSince] = useState<Record<string, number> | null>(null);
  /** A briefing was built this session (so the button can reopen it), and whether it has been opened. */
  const [available, setAvailable] = useState(false);
  const [unread, setUnread] = useState(false);
  /** Last-seen times the most recent briefing was built from, for the header button. */
  const lastSince = useRef<{ seen: Record<string, number>; any?: number }>();
  /** The visit "Since you were away" counts from (Hands-off's home): set on arrival, kept across reloads. */
  const [visit, setVisit] = useState<AwayVisit>();
  const lastInput = useRef(Date.now());
  const started = useRef(false);
  const awayMs = prefs.awayMinutes * 60_000;
  const apiRef = useRef(api);
  apiRef.current = api;
  const attentionRef = useRef(attention);
  attentionRef.current = attention;

  const compute = useCallback(
    (seen: Record<string, number>, any?: number): Briefing => {
      const a = apiRef.current;
      return buildBriefing({
        snaps: Object.values(a.allSnaps),
        decisions: a.decisions,
        activity: a.activity,
        ledger: rt.activity.ledger,
        since: (id) => seen[id] ?? any ?? a.allSnaps[id]?.map.createdAt ?? Date.now(),
        currentMapId: a.mapId,
        attention: attentionRef.current,
      });
    },
    [rt],
  );

  const markSeen = useCallback(
    (at = Date.now()) =>
      rt.presence?.markSeen(
        apiRef.current.maps.map((m) => m.id),
        at,
      ),
    [rt],
  );

  /** Called when the trail lead arrives (app open) or comes back; opens the briefing if they were away and something changed. */
  const arrive = useCallback(() => {
    const p = rt.presence;
    if (!p) return;
    const any = p.lastSeenAny();
    const away = any !== undefined && Date.now() - any >= awayMs;
    const last = { seen: p.snapshot(), any };
    if (away) setVisit(awayVisit(last, last));
    else setVisit((v) => v ?? awayVisit(undefined, last));
    if (away) {
      const seen = p.snapshot();
      if (compute(seen, any).changed) {
        lastSince.current = { seen, any };
        setAvailable(true);
        // With auto-open off, the briefing waits behind the header button, marked new.
        if (prefs.enabled) setSince(seen);
        else setUnread(true);
      }
    }
    markSeen();
  }, [rt, awayMs, prefs.enabled, compute, markSeen]);

  useEffect(() => {
    if (!api.loaded || started.current || !rt.presence) return;
    started.current = true;
    arrive();
  }, [api.loaded, rt, arrive]);

  useEffect(() => {
    const onInput = () => {
      const idle = Date.now() - lastInput.current >= awayMs;
      lastInput.current = Date.now();
      if (idle && started.current && document.visibilityState === 'visible') arrive();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        if (started.current) markSeen(Date.now() - lastInput.current < awayMs ? Date.now() : lastInput.current);
        return;
      }
      lastInput.current = Date.now();
      if (started.current) arrive();
    };
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const tick = setInterval(() => {
      if (!started.current) return;
      if (document.visibilityState === 'visible') markSeen(lastInput.current);
    }, TICK_MS);
    return () => {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(tick);
    };
  }, [awayMs, arrive, markSeen]);

  const briefing = useMemo(
    () => (since ? compute(since, lastSince.current?.any) : undefined),
    // Recomputed live while open so answers and new results show up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [since, compute, api.allSnaps, api.decisions, api.activity, attention],
  );
  const line = useMemo(() => (briefing ? briefingLine(briefing) : ''), [briefing]);
  const sinceAway = useMemo(
    () => visit && compute(visit.seen, visit.any),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visit, compute, api.allSnaps, api.decisions, api.activity, attention],
  );

  useEffect(() => {
    if (since) setUnread(false);
  }, [since]);
  let status: BriefingStatus = 'none';
  if (unread) status = 'new';
  else if (available) status = 'seen';

  return {
    shown: since !== null,
    status,
    briefing,
    line,
    /** What changed since the person's last visit, for Hands-off's home; undefined until they arrive. */
    sinceAway,
    /** When the person was last on a trail before this visit (else on any); undefined until they arrive. */
    awaySince: (mapId?: string) => visit && ((mapId && visit.seen[mapId]) || visit.any),
    /** Header button: the last briefing again. */
    open: () => {
      const l = lastSince.current;
      if (l) setSince(l.seen);
    },
    dismiss: () => setSince(null),
  };
}
