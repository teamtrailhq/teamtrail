import type { AttentionItem, AttentionState } from '../model/attention';
import { orderInBatches } from './batch';
import { DEFAULT_ATTENTION_POLICY, EMPTY_ATTENTION_STATE } from './defaults';
import { heldTickets } from './heldTickets';
import { isDismissable } from './isDismissable';
import { scoreCandidate } from './score';
import { ATTENTION_SOURCES } from './sources/registry';
import type { AttentionInput, AttentionSource, Candidate } from './types';

export interface AttentionQueue {
  /** Ranked, best first, batches kept together. */
  items: AttentionItem[];
  /** How many items snoozes and dismissals hide right now. */
  hidden: number;
}

function hiddenBy(state: AttentionState, item: AttentionItem, now: number): boolean {
  if ((state.snoozed[item.id] ?? 0) > now) return true;
  return isDismissable(item) && state.dismissed.includes(item.id);
}

/**
 * The attention queue: every place the human is needed, ranked by explainable points.
 * Pure: the same input always gives the same order. `sources` defaults to every registered source.
 */
export function buildAttention(input: AttentionInput, sources: AttentionSource[] = ATTENTION_SOURCES): AttentionQueue {
  const policy = input.policy ?? DEFAULT_ATTENTION_POLICY;
  const state = input.state ?? EMPTY_ATTENTION_STATE;
  const snaps = new Map(input.snaps.map((s) => [s.map.id, s]));
  const toItem = (c: Candidate): AttentionItem => {
    const held = heldTickets(snaps.get(c.mapId), c.holds, c.ticketId).length;
    const { score, reasons } = scoreCandidate({ candidate: c, held, policy, now: input.now });
    return {
      id: `${c.kind}:${c.mapId}:${c.ref}`,
      kind: c.kind,
      mapId: c.mapId,
      ...(c.ticketId ? { ticketId: c.ticketId } : {}),
      title: c.title,
      since: c.since,
      urgency: c.urgency,
      score,
      reasons,
      batchKey: c.batchKey ?? `${c.mapId}:${c.kind}`,
      ref: c.ref,
      ...(c.agent ? { agent: c.agent } : {}),
    };
  };
  const candidates = sources.flatMap((s) => s.collect(input));
  const all = candidates.map(toItem);
  const waitedOn = new Set(
    all.filter((_, n) => candidates[n].kind === 'question' && candidates[n].idleAgent).map((i) => i.id),
  );
  const unique = [...new Map(all.map((i) => [i.id, i])).values()];
  const shown = unique.filter((i) => !hiddenBy(state, i, input.now));
  return { items: orderInBatches(shown, waitedOn), hidden: unique.length - shown.length };
}
