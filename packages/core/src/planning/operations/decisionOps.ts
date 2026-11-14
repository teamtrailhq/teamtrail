import type { TrackerAdapter } from '../../adapters/adapter';
import type { DecisionInput, DecisionRecord } from '../../model/types';
import { assertLookoutGuard, type LookoutGuard } from './lookoutGuard';
import { OperationError } from './operationError';
import { assertSupersedeGuard } from './supersedeGuard';

/**
 * Record a decision (from any source: Lookout, agent, Slack, tracker import)
 * and, unless `appendToTrail` is false, add `trailLine` (default: its summary) to the map's "Decisions so far".
 * Re-recording the same `source.kind` + `source.ref` returns the existing record.
 */
export async function recordDecision(
  adapter: TrackerAdapter,
  mapId: string,
  input: DecisionInput,
  opts: { appendToTrail?: boolean; trailLine?: string; guard?: LookoutGuard } = {},
) {
  // A decision on a ticket from anywhere but the Lookout is refused when the ticket is high risk (lookoutGuard.ts).
  await assertLookoutGuard(
    { ...opts.guard, sourceKind: input.source.kind },
    { mapId, ticketId: input.ticketId, key: input.ticketKey },
  );
  if (input.source.ref) {
    // Only this machine's own records: a teammate's can't pre-empt one by posting its source first.
    const dup = (await adapter.listDecisions(mapId)).find(
      (d) => !d.postedBy && d.source.kind === input.source.kind && d.source.ref === input.source.ref,
    );
    if (dup) return dup;
  }
  const rec = await adapter.createDecision(mapId, input);
  if (opts.appendToTrail ?? true) {
    const fresh = await adapter.loadMap(mapId);
    await adapter.updateMapSections(mapId, {
      decisions: [
        ...fresh.map.sections.decisions,
        { ticketId: rec.ticketId, ticketKey: rec.ticketKey, text: opts.trailLine ?? rec.summary },
      ],
    });
  }
  return rec;
}

/**
 * Replace a decision: new record pointing back at the old one, old one marked superseded, trail line swapped. The
 * new decision is on the old one's ticket unless it names another; the `guard` checks the old one's ticket and risk
 * as well as the new one's (supersedeGuard.ts).
 */
export async function supersedeDecision(
  adapter: TrackerAdapter,
  mapId: string,
  decisionId: string,
  { guard, ...input }: Omit<DecisionInput, 'question' | 'supersedes'> & { question?: string; guard?: LookoutGuard },
): Promise<DecisionRecord> {
  const all = await adapter.listDecisions(mapId);
  const old = all.find((d) => d.id === decisionId);
  if (!old) throw new OperationError(`decision ${decisionId} not found`);
  if (old.postedBy) throw new OperationError(`${old.id} is ${old.postedBy}'s decision; record your own instead`);
  if (old.supersededBy) throw new OperationError(`${old.id} is already superseded by ${old.supersededBy}`);
  const next = {
    ticketId: old.ticketId,
    ticketKey: old.ticketKey,
    ...input,
    question: input.question ?? old.question,
    supersedes: old.id,
  };
  await assertSupersedeGuard({ ...guard, sourceKind: input.source.kind }, { mapId, old, next });
  const rec = await adapter.createDecision(mapId, next);
  await adapter.markSuperseded(mapId, old.id, rec.id);
  const fresh = await adapter.loadMap(mapId);
  const ds = fresh.map.sections.decisions;
  const i = ds.findIndex(
    (x) =>
      x.text === old.summary ||
      (!!old.ticketId && x.ticketId === old.ticketId) ||
      (!!old.ticketKey && x.ticketKey === old.ticketKey),
  );
  const line = { ticketId: rec.ticketId, ticketKey: rec.ticketKey, text: rec.summary };
  await adapter.updateMapSections(mapId, { decisions: i < 0 ? [...ds, line] : ds.map((x, j) => (j === i ? line : x)) });
  return rec;
}
