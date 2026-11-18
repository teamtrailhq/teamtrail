import type { TrackerAdapter } from '../adapters/adapter';
import { TrackerError } from '../adapters/remote/http';
import type { TicketPhase } from '../model/lifecycle';
import type { CiProvider, PrLink, TicketSync } from '../model/prEvidence';
import type { Ticket } from '../model/types';
import { derivePhases } from '../planning/lifecycle/phase';
import { readAttempts } from '../verification/evidenceStore';
import { redact } from '../verification/redact';
import { ticketRefs } from './attemptRefs';
import { findLink, indexRecent, type LinkScope } from './findLink';
import { summarizeChecks } from './github/checkState';
import { mismatchFlags } from './mismatchFlags';
import { recent, type ReconcileMemo } from './reconcileMemo';
import { appendFlagEntry, dropOrphanSyncs, readTicketSync, writeTicketSync } from './syncStore';

export interface ReconcileEnv {
  /** Tracker folder: `.evidence/` and `.events/` live here. */
  root: string;
  /** Read only: the reconciler lists and loads trails, nothing else. */
  adapter: TrackerAdapter;
  provider: CiProvider;
  requiredChecks: string[];
  now?: () => number;
  /** What the loop remembers between ticks (reconcileMemo.ts); without it every tick reads everything. */
  memo?: ReconcileMemo;
}

export interface ReconcileResult {
  /** Tickets whose snapshot, flags or error changed. */
  changed: TicketSync[];
  /** `<ticket key>: <reason>` per ticket that could not be read, secrets redacted. */
  failures: string[];
}

const comparable = (s: TicketSync) => JSON.stringify([s.link, s.pr, s.checks, s.flags, s.error, s.replaced ?? []]);

interface TicketContext {
  env: ReconcileEnv;
  mapId: string;
  t: Ticket;
  phase: TicketPhase;
  scope: LinkScope;
  now: number;
}

async function reconcileTicket(c: TicketContext): Promise<TicketSync | undefined> {
  const { env, mapId, t, now } = c;
  const prev = readTicketSync(env.root, mapId, t.id);
  const refs = ticketRefs(readAttempts(env.root, mapId, t.id));
  const { link, replaced } = await findLink(c.scope, { mapId, ticketId: t.id, prev, refs });
  if (!link) return undefined;
  const { pr, checks } = await readPr(c, prev, link);
  const checksSummary = summarizeChecks(checks);
  const flags = mismatchFlags(
    { phase: c.phase, pr, checks: checksSummary, verifiedHead: refs.verifiedHead },
    prev?.flags ?? [],
    now,
  );
  const next: TicketSync = {
    v: 1,
    mapId,
    ticketId: t.id,
    ticketKey: t.key,
    provider: env.provider.name,
    link,
    pr,
    checks,
    checksSummary,
    flags,
    syncedAt: now,
    ...(replaced.length ? { replaced } : {}),
  };
  // written only when something changed: an unchanged rewrite every tick told every open page the evidence changed
  if (prev && comparable(prev) === comparable(next)) return undefined;
  writeTicketSync(env.root, next);
  logFlagChanges(env.root, prev, next, now);
  return next;
}

/**
 * The PR and its checks. A closed or merged PR isn't read again while it hasn't changed: the recent PRs show it
 * unchanged, or, once it fell out of them (nothing updated it since), it was read within the hour.
 */
async function readPr(c: TicketContext, prev: TicketSync | undefined, link: PrLink) {
  const listed = c.scope.recentPrs.get(link.number);
  const last = prev?.pr;
  const memo = c.env.memo;
  const unchanged = listed
    ? listed.state === last?.state && listed.updatedAt === last.updatedAt
    : recent(memo?.readAt.get(link.number), c.now);
  const settled =
    last?.number === link.number &&
    last.state !== 'open' &&
    // a merged PR read before merge commits were kept is read once more (trailChecks/)
    (last.state !== 'merged' || last.mergeCommit !== undefined) &&
    unchanged;
  if (settled && prev) return { pr: last, checks: prev.checks };
  const pr = await c.env.provider.pull(link.number);
  memo?.readAt.set(link.number, c.now);
  const checks = pr.state === 'closed' ? [] : await c.env.provider.checks(pr.headSha, c.env.requiredChecks);
  return { pr, checks };
}

/** Reconciles one ticket; a failure other than a rate limit is reported and marked on its last snapshot. */
async function reconcileOrMark(c: TicketContext): Promise<{ sync?: TicketSync; failure?: string }> {
  try {
    return { sync: await reconcileTicket(c) };
  } catch (e) {
    if (e instanceof TrackerError && e.code === 'rate_limited') throw e;
    const reason = redact(String((e as Error)?.message ?? e)).slice(0, 300);
    const sync = markFailed(c.env.root, readTicketSync(c.env.root, c.mapId, c.t.id), reason);
    return { sync, failure: `${c.t.key}: ${reason}` };
  }
}

/** A ticket that could not be read keeps its last snapshot, marked with the error. */
function markFailed(root: string, prev: TicketSync | undefined, reason: string): TicketSync | undefined {
  if (!prev || prev.error === reason) return undefined;
  const marked = { ...prev, error: reason };
  writeTicketSync(root, marked);
  return marked;
}

export function logFlagChanges(root: string, prev: TicketSync | undefined, next: TicketSync | undefined, at: number) {
  const before = prev?.flags ?? [];
  const after = next?.flags ?? [];
  const s = next ?? prev;
  if (!s) return;
  const base = { v: 1 as const, at, mapId: s.mapId, ticketId: s.ticketId, ticketKey: s.ticketKey };
  for (const f of after)
    if (!before.some((b) => b.kind === f.kind))
      appendFlagEntry(root, { ...base, kind: 'flag.raised', flag: f.kind, text: f.text });
  for (const f of before)
    if (!after.some((a) => a.kind === f.kind))
      appendFlagEntry(root, { ...base, kind: 'flag.cleared', flag: f.kind, text: f.text });
}

/**
 * One reconciler tick: finds each ticket's PR, reads its state and checks,
 * and raises or clears mismatch flags in `sync.json`. It never writes to the
 * tracker. A ticket that cannot be read keeps its last snapshot and flags,
 * marked with `error`; a rate limit aborts the whole tick.
 */
export async function reconcile(env: ReconcileEnv): Promise<ReconcileResult> {
  const now = (env.now ?? Date.now)();
  const listed = await env.provider.recent();
  const scope: LinkScope = { provider: env.provider, ...indexRecent(listed), memo: env.memo, now };
  const changed: TicketSync[] = [];
  const failures: string[] = [];
  const kept = new Set<string>();
  for (const summary of await env.adapter.listMaps()) {
    const snap = await env.adapter.loadMap(summary.id);
    const phases = derivePhases(snap.tickets, snap.map.mode);
    for (const t of snap.tickets) {
      kept.add(`${snap.map.id}/${t.id}`);
      const c = { env, mapId: snap.map.id, t, phase: phases.get(t.id)!, scope, now };
      const r = await reconcileOrMark(c);
      if (r.sync) changed.push(r.sync);
      if (r.failure) failures.push(r.failure);
    }
  }
  dropOrphanSyncs(env.root, kept);
  return { changed, failures };
}
