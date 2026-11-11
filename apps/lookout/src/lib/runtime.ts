import {
  BRAND,
  ActivityStream,
  type AgentSessionDoc,
  type KeyValueStore,
  PREFS_KEY,
  type TicketLease,
  type TrackerAdapter,
  Presence,
  BridgeAdapter,
  UsageLedger,
  MarkdownAdapter,
  monitorTracker,
  httpJournal,
  type Journal,
} from '@teamtrail/core';
import { apiBase } from './apiBase';
import { httpFs } from './httpFs';
import { LeaseBoard } from './leaseBoard';
import { type TrackerChoice, loadPrefs } from './prefs';
import { SessionEventSource } from './sessionEvents';

/** Mirror agent sessions reported over MCP (see core agentLink.ts) and send trail lead answers back to them. */
export function linkAgents(activity: ActivityStream, leases: LeaseBoard) {
  activity.remoteAnswer = (q, text, author) => {
    void fetch(`${apiBase()}/agents/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: q.sessionId, questionId: q.id, text, author }),
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      })
      .catch((e: Error) =>
        activity.push({
          source: 'system',
          level: 'alert',
          sessionId: q.sessionId,
          text: `Answer not delivered to ${q.agent} · ${e.message}`,
        }),
      );
  };
  const es = new SessionEventSource();
  es.addEventListener('agent', (m) =>
    activity.syncRemote(JSON.parse((m as MessageEvent<string>).data) as AgentSessionDoc),
  );
  es.addEventListener('leases', (m) => leases.set(JSON.parse((m as MessageEvent<string>).data).leases));
  void fetch(`${apiBase()}/agents/leases`)
    .then((r) => (r.ok ? (r.json() as Promise<{ leases: TicketLease[] }>) : { leases: [] }))
    .then(({ leases: l }) => leases.set(l))
    .catch(() => {});
  void fetch(`${apiBase()}/agents`)
    .then((r) => (r.ok ? (r.json() as Promise<{ sessions: AgentSessionDoc[] }>) : { sessions: [] }))
    .then(({ sessions }) => [...sessions].reverse().forEach((d) => activity.syncRemote(d)))
    .catch(() => {});
}

export type TrackerKind = TrackerChoice;

/** localStorage, namespaced per tracker so each repo keeps its own presence and usage history. */
export function localStore(scope: string): KeyValueStore {
  const k = (key: string) => `${PREFS_KEY}:${scope}:${key}`;
  return {
    get: (key) => localStorage.getItem(k(key)),
    set: (key, v) => {
      try {
        localStorage.setItem(k(key), v);
      } catch {
        // storage full or blocked: presence is best effort
      }
    },
  };
}

export const KINDS: TrackerKind[] = ['markdown', 'github', 'linear'];

/** `?tracker=markdown|github|linear` overrides the saved preference (handy for tests). */
export function trackerKind(): TrackerKind {
  const q = new URLSearchParams(location.search).get('tracker') as TrackerKind | null;
  return q && KINDS.includes(q) ? q : loadPrefs().tracker;
}

export function createRuntime(kind: TrackerKind) {
  let raw: TrackerAdapter;
  let ready: Promise<unknown>;
  const activity = new ActivityStream();
  const leases = new LeaseBoard(activity);
  const store: { presence?: Presence } = {};
  /** Every tracker appends history to `.events/` through the local server. */
  const journal: Journal = httpJournal(apiBase());
  if (kind === 'github' || kind === 'linear') {
    const remote = new BridgeAdapter(kind, apiBase());
    raw = remote;
    ready = fetch(`${apiBase()}/trackers`)
      .then(
        (r) => r.json() as Promise<{ github: { repo?: string }; linear: { teamKey?: string; projectName?: string } }>,
      )
      .catch(() => undefined)
      .then((s) => {
        remote.location =
          (kind === 'github'
            ? s?.github.repo
            : [s?.linear.teamKey, s?.linear.projectName].filter(Boolean).join(' · ')) || remote.location;
        const kv = localStore(`${kind}:${remote.location}`);
        store.presence = new Presence(kv);
        activity.ledger = new UsageLedger(kv);
        linkAgents(activity, leases);
      });
  } else {
    raw = new MarkdownAdapter(httpFs, `./${BRAND.dataDir}`);
    ready = fetch(`${apiBase()}/list`)
      .then((r) => r.json() as Promise<{ root: string }>)
      .catch(() => ({ root: 'default' }))
      .then(({ root }) => {
        const kv = localStore(root);
        store.presence = new Presence(kv);
        activity.ledger = new UsageLedger(kv);
        linkAgents(activity, leases);
      });
  }
  /** Every read/write goes through the monitor so sync status and latency are measured, not invented. */
  const monitor = monitorTracker(raw);
  const adapter = monitor.adapter;
  return {
    kind,
    /** Resolves once storage is scoped to the tracker. */
    ready,
    /** Last seen per trail; set once `ready` resolves. */
    get presence() {
      return store.presence;
    },
    adapter,
    journal,
    monitor,
    activity,
    leases,
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
