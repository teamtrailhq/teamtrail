import type { TrackerAdapter } from '../adapters/adapter';
import { readAgentDocs } from '../agents/agentDocs';
import { journalFile } from '../history/journalFile';
import type { AttemptGuide } from '../model/guide';
import type { ScorecardSession, ScorecardTicket } from '../model/scorecard';
import type { MapSnapshot, Ticket } from '../model/types';
import { readAttempts, readVerdicts } from '../verification/evidenceStore';

/** Session records kept for the scorecard: every one on disk, however old. */
const ALL = { recentMs: Number.MAX_SAFE_INTEGER, limit: Number.MAX_SAFE_INTEGER };

const guidesOf = (guides?: AttemptGuide[]) => (guides ? { guides: guides.map((g) => g.id) } : {});

function ticketOf(root: string, snap: MapSnapshot, t: Ticket, claims: Map<string, number>): ScorecardTicket {
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
  };
}

/** Every trail's tickets with a completion, and every session's model and spend, as the scorecard reads them. */
export async function scorecardInput(root: string, adapter: TrackerAdapter) {
  const tickets: ScorecardTicket[] = [];
  const journal = journalFile(root);
  for (const summary of await adapter.listMaps()) {
    const snap = await adapter.loadMap(summary.id);
    const claims = new Map<string, number>();
    for (const e of journal.read(snap.map.id))
      if (e.event === 'claim' && e.ticketId && !claims.has(e.ticketId)) claims.set(e.ticketId, e.at);
    for (const t of snap.tickets) {
      if (t.type === 'review') continue;
      const ticket = ticketOf(root, snap, t, claims);
      if (ticket.attempts.length) tickets.push(ticket);
    }
  }
  const sessions: ScorecardSession[] = (await readAgentDocs(root, ALL)).map((d) => ({
    id: d.session.id,
    model: d.session.model,
    costUsd: d.session.usage?.costUsd,
  }));
  return { tickets, sessions };
}
