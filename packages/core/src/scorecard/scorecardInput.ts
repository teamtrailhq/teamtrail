import type { TrackerAdapter } from '../adapters/adapter';
import { readAgentDocs } from '../agents/agentDocs';
import { journalFile } from '../history/journalFile';
import type { Escape } from '../model/escape';
import type { AttemptGuide } from '../model/guide';
import type { ScorecardSession, ScorecardTicket } from '../model/scorecard';
import type { MapSnapshot, Ticket } from '../model/types';
import type { CheckResult, VerificationAttempt } from '../model/verification';
import { readAttempts, readVerdicts } from '../verification/evidenceStore';
import { readEscapes } from './readEscapes';

/** Session records kept for the scorecard: every one on disk, however old. */
const ALL = { recentMs: Number.MAX_SAFE_INTEGER, limit: Number.MAX_SAFE_INTEGER };

const guidesOf = (guides?: AttemptGuide[]) => (guides ? { guides: guides.map((g) => g.id) } : {});
const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** The came-back mark and the checks that passed on the verified attempt (the one that came back, when it did). */
function escapeFields(attempts: VerificationAttempt[], escape?: Escape) {
  const verified =
    attempts.find((a) => a.id === escape?.attemptId) ?? [...attempts].reverse().find((a) => a.result === 'pass');
  return {
    ...(escape ? { escaped: true } : {}),
    ...(verified ? { passedChecks: verified.checks.filter(passed).map((c) => c.name) } : {}),
  };
}

function ticketOf(input: {
  root: string;
  snap: MapSnapshot;
  t: Ticket;
  claims: Map<string, number>;
  escapes: Escape[];
}): ScorecardTicket {
  const { root, snap, t, claims } = input;
  const attempts = readAttempts(root, snap.map.id, t.id);
  const findings = { info: 0, warn: 0, error: 0 };
  for (const v of readVerdicts(root, snap.map.id, t.id)) for (const f of v.findings) findings[f.severity] += 1;
  const done = t.state === 'closed' && t.closeReason === 'completed';
  const claimedAt = claims.get(t.id);
  return {
    mapId: snap.map.id,
    ticketId: t.id,
    type: t.type,
    verified: done && attempts.at(-1)?.result === 'pass',
    attempts: attempts.map((a) => ({ agent: a.agent, sessionId: a.sessionId, result: a.result })),
    findings,
    leadMs: done && claimedAt && t.closedAt && t.closedAt >= claimedAt ? t.closedAt - claimedAt : undefined,
    ...guidesOf(attempts.at(-1)?.guides),
    ...escapeFields(
      attempts,
      input.escapes.find((e) => e.mapId === snap.map.id && e.ticketId === t.id),
    ),
  };
}

/**
 * Every trail's tickets with a completion, every session's model and spend, and the verified work that came back,
 * as the scorecard reads them.
 */
export async function scorecardInput(root: string, adapter: TrackerAdapter) {
  const tickets: ScorecardTicket[] = [];
  const journal = journalFile(root);
  const snaps = await Promise.all((await adapter.listMaps()).map((m) => adapter.loadMap(m.id)));
  const escapes = await readEscapes(root, snaps);
  for (const snap of snaps) {
    const claims = new Map<string, number>();
    for (const e of journal.read(snap.map.id))
      if (e.event === 'claim' && e.ticketId && !claims.has(e.ticketId)) claims.set(e.ticketId, e.at);
    for (const t of snap.tickets) {
      if (t.type === 'review') continue;
      const ticket = ticketOf({ root, snap, t, claims, escapes });
      if (ticket.attempts.length) tickets.push(ticket);
    }
  }
  const sessions: ScorecardSession[] = (await readAgentDocs(root, ALL)).map((d) => ({
    id: d.session.id,
    model: d.session.model,
    costUsd: d.session.usage?.costUsd,
  }));
  return { tickets, sessions, escapes };
}
