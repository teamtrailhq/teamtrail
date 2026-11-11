import {
  BRAND,
  ActivityStream,
  type KeyValueStore,
  PREFS_KEY,
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
import { linkAgents } from './linkAgents';
import { type TrackerChoice, loadPrefs } from './prefs';
import { SessionEventSource } from './sessionEvents';

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
    // the tracker's own event stream sits behind the Lookout's sign-in, like `/events`
    remote.openEvents = (path) => new SessionEventSource(apiBase(), path);
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
