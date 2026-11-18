import type { TrackerAdapter } from '../adapters/adapter';
import { TrackerError } from '../adapters/remote/http';
import type { TicketPhase } from '../model/lifecycle';
import type { CiProvider, PrCandidate, PrLink, PrLinkSource, TicketSync } from '../model/prEvidence';
import type { Ticket } from '../model/types';
import { derivePhases } from '../planning/lifecycle/phase';
import { readAttempts } from '../verification/evidenceStore';
import { redact } from '../verification/redact';
import { ticketRefs } from './attemptRefs';
import { summarizeChecks } from './github/checkState';
import { ticketRef } from './github/prText';
import { mismatchFlags } from './mismatchFlags';
import { appendFlagEntry, readTicketSync, writeTicketSync } from './syncStore';

export interface ReconcileEnv {
  /** Tracker folder: `.evidence/` and `.events/` live here. */
  root: string;
  /** Read only: the reconciler lists and loads trails, nothing else. */
  adapter: TrackerAdapter;
  provider: CiProvider;
  requiredChecks: string[];
  now?: () => number;
}

export interface ReconcileResult {
  /** Tickets whose snapshot, flags or error changed. */
  changed: TicketSync[];
  /** `<ticket key>: <reason>` per ticket that could not be read, secrets redacted. */
  failures: string[];
}

const RANK: Record<PrLinkSource, number> = { explicit: 4, attempt: 3, branch: 2, marker: 1 };

function strongest(links: (PrLink | undefined)[]): PrLink | undefined {
  let best: PrLink | undefined;
  for (const l of links) if (l && (!best || RANK[l.source] > RANK[best.source])) best = l;
  return best;
}

const comparable = (s: TicketSync) => JSON.stringify([s.link, s.pr, s.checks, s.flags, s.error]);

interface TicketContext {
  env: ReconcileEnv;
  mapId: string;
  t: Ticket;
  phase: TicketPhase;
  byRef: Map<string, PrCandidate>;
  now: number;
}

type Refs = ReturnType<typeof ticketRefs>;

async function reconcileTicket(c: TicketContext): Promise<TicketSync | undefined> {
  const { env, mapId, t, now } = c;
  const prev = readTicketSync(env.root, mapId, t.id);
  const refs = ticketRefs(readAttempts(env.root, mapId, t.id));
  const link = await findLink(c, prev, refs);
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
  };
  writeTicketSync(env.root, next);
  logFlagChanges(env.root, prev, next, now);
  return prev && comparable(prev) === comparable(next) ? undefined : next;
}

/** The ticket's PR: the strongest of the attempt's PR, the last link, a marker in a PR, and the attempt's branch. */
async function findLink(c: TicketContext, prev: TicketSync | undefined, refs: Refs): Promise<PrLink | undefined> {
  const marked = c.byRef.get(ticketRef(c.mapId, c.t.id));
  let link = strongest([
    refs.pr ? { number: refs.pr, source: 'attempt', at: c.now } : undefined,
    prev?.link,
    marked ? { number: marked.pr.number, source: 'marker', at: c.now } : undefined,
  ]);
  const branchIsStronger = !link || RANK[link.source] < RANK.branch;
  if (refs.branch && branchIsStronger) link = (await branchLink(c, refs.branch)) ?? link;
  const sameAsBefore = link && prev?.link.number === link.number && prev.link.source === link.source;
  return sameAsBefore ? prev?.link : link;
}

async function branchLink(c: TicketContext, branch: string): Promise<PrLink | undefined> {
  const found = await c.env.provider.forBranch(branch);
  const pick = found.find((p) => p.state === 'open') ?? found[0];
  return pick && { number: pick.number, source: 'branch', at: c.now };
}

/** The PR and its checks; a closed or merged PR that hasn't changed since the last tick isn't read again. */
async function readPr(c: TicketContext, prev: TicketSync | undefined, link: PrLink) {
  const listed = [...c.byRef.values()].find((x) => x.pr.number === link.number)?.pr;
  const last = prev?.pr;
  const settled =
    last?.number === link.number &&
    last.state !== 'open' &&
    // a merged PR read before merge commits were kept is read once more (trailChecks/)
    (last.state !== 'merged' || last.mergeCommit !== undefined) &&
    listed?.state === last.state &&
    listed.updatedAt === last.updatedAt;
  if (settled && prev) return { pr: last, checks: prev.checks };
  const pr = await c.env.provider.pull(link.number);
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
  const byRef = new Map<string, PrCandidate>();
  for (const c of await env.provider.recent()) for (const ref of c.markers) if (!byRef.has(ref)) byRef.set(ref, c);
  const changed: TicketSync[] = [];
  const failures: string[] = [];
  for (const summary of await env.adapter.listMaps()) {
    const snap = await env.adapter.loadMap(summary.id);
    const phases = derivePhases(snap.tickets, snap.map.mode);
    for (const t of snap.tickets) {
      const r = await reconcileOrMark({ env, mapId: snap.map.id, t, phase: phases.get(t.id)!, byRef, now });
      if (r.sync) changed.push(r.sync);
      if (r.failure) failures.push(r.failure);
    }
  }
  return { changed, failures };
}
