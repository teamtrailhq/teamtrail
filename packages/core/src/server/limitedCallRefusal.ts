import type { TrackerAdapter } from '../adapters/adapter';
import { highRiskRefusal } from '../model/highRiskRefusal';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** What a call decides: a ticket it closes, reopens or records a decision on, or a decision it marks superseded. */
type Decided = { kind: 'ticket'; id?: string; key?: string } | { kind: 'decision'; id: string } | { kind: 'none' };

function decidedBy(method: string, args: unknown[]): Decided {
  if (method === 'close' || method === 'reopen') return { kind: 'ticket', id: str(args[1]) };
  if (method === 'markSuperseded') {
    const id = str(args[1]);
    return id ? { kind: 'decision', id } : { kind: 'none' };
  }
  if (method !== 'createDecision') return { kind: 'none' };
  const input = (args[1] ?? {}) as { ticketId?: unknown; ticketKey?: unknown };
  return { kind: 'ticket', id: str(input.ticketId), key: str(input.ticketKey) };
}

/** The ticket a call decides, a decision's by its record; `high` when the decision was recorded high risk. */
async function ticketOf(c: { adapter: TrackerAdapter; mapId: string; decided: Decided }) {
  const { adapter, mapId, decided } = c;
  if (decided.kind === 'none') return {};
  if (decided.kind === 'decision') {
    const old = (await adapter.listDecisions(mapId)).find((d) => d.id === decided.id);
    return { ticketId: old?.ticketId, high: old?.risk?.level === 'high' };
  }
  if (decided.id || !decided.key) return { ticketId: decided.id };
  // named by its key only: the ticket that key is
  const { tickets } = await adapter.loadMap(mapId);
  return { ticketId: tickets.find((t) => t.key === decided.key)?.id };
}

/**
 * Why a caller not allowed high-risk calls (limitedRequests.ts) may not make this tracker call (GitHub, Linear), or
 * undefined when it may: the same limit as the raw file route (limitedFileRefusal.ts). On a ticket only the Lookout's
 * full word may decide (policy/ticketNeedsLookout.ts) it can't close or reopen it, record a decision on it (by its id
 * or its key), nor mark a decision on it, or one recorded high risk, superseded.
 */
export async function limitedCallRefusal(
  c: { root: string; adapter: () => Promise<TrackerAdapter> },
  call: { method: string; args: unknown[] },
): Promise<string | undefined> {
  const mapId = str(call.args[0]);
  const decided = decidedBy(call.method, call.args);
  if (!mapId || decided.kind === 'none') return undefined;
  const { ticketId, high } = await ticketOf({ adapter: await c.adapter(), mapId, decided });
  const which = decided.kind === 'decision' ? decided.id : `Ticket ${ticketId ?? decided.key ?? '?'}`;
  if (high) return highRiskRefusal(which, 'lookout-limited');
  if (!ticketId) return undefined;
  return (await ticketNeedsLookout(c.root, mapId, ticketId)) ? highRiskRefusal(which, 'lookout-limited') : undefined;
}
