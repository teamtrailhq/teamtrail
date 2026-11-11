import { existsSync } from 'node:fs';
import path from 'node:path';
import { levelOf, VERIFICATION_LEVELS, type VerificationLevel } from '../model/lifecycle';
import type { MapDoc, Ticket, TicketType } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { contentHash, trustKey, trustLedger, type TrustRecord } from '../trust/trustLedger';
import type { LevelInfo } from './policy';

const rank = (l: VerificationLevel) => VERIFICATION_LEVELS.indexOf(l);
type Ledger = Record<string, TrustRecord>;
const recorded = (ledger: Ledger, key: string) => levelOf(ledger[key]?.content);

/** The ticket's type as recorded here (when its trail's level was set, or it was claimed), else its file's type. */
export const recordedType = (ledger: Ledger, mapId: string, t: Pick<Ticket, 'id' | 'type'>) =>
  (ledger[trustKey.type(mapId, t.id)]?.content as TicketType | undefined) ?? t.type;

/**
 * The level this machine holds a ticket to: its own override if the trail lead set one here, else the trail's when
 * the trail's level applies to the ticket's recorded type (a type edited in its file doesn't move it out). A trail
 * whose level was never recorded here is held at the approved config's default until the trail lead adopts it.
 * Undefined when nothing applies (no approved config, or a type the trail's level doesn't cover).
 */
export function levelFloor(
  ledger: Ledger,
  input: { config?: VerificationConfig; map: MapDoc; t: Pick<Ticket, 'id' | 'type'> },
): VerificationLevel | undefined {
  const own = recorded(ledger, trustKey.level(input.map.id, input.t.id));
  if (own) return own;
  const type = recordedType(ledger, input.map.id, input.t);
  if (!input.config || !input.config.appliesTo.includes(type)) return undefined;
  return recorded(ledger, trustKey.level(input.map.id)) ?? input.config.default;
}

/** Records each ticket's type, where none is recorded yet: the trail's level applies to tickets by these. */
export function recordTypes(root: string, mapId: string, tickets: Pick<Ticket, 'id' | 'type'>[]) {
  const ledger = trustLedger(root);
  const known = ledger.all();
  const fresh = tickets.filter((t) => !known[trustKey.type(mapId, t.id)]);
  if (!fresh.length) return;
  const at = Date.now();
  const rec = (t: Pick<Ticket, 'id' | 'type'>) => ({ hash: contentHash(t.type), at, by: 'teamtrail', content: t.type });
  ledger.set(Object.fromEntries(fresh.map((t) => [trustKey.type(mapId, t.id), rec(t)])));
}

/**
 * The verification a completion needs on this machine. A trail's and a ticket's level live in tracker files an agent
 * can edit, so a level lower than the one approved here waits for the trail lead (`lowered` says what the file asks
 * for) and the approved one holds; raising applies at once.
 */
export function withApprovedLevel(
  root: string,
  input: { config?: VerificationConfig; map: MapDoc; t: Pick<Ticket, 'id' | 'type'>; info: LevelInfo },
): LevelInfo & { lowered?: VerificationLevel } {
  const floor = levelFloor(trustLedger(root).all(), input);
  if (!floor || rank(input.info.level) >= rank(floor)) return input.info;
  return { ...input.info, level: floor, lowered: input.info.level };
}

/** The trail lead (or Teamtrail on their behalf, from the approved config) set this level here. */
export function recordLevel(root: string, at: { mapId: string; ticketId?: string }, level: VerificationLevel | null) {
  const key = trustKey.level(at.mapId, at.ticketId);
  const ledger = trustLedger(root);
  if (level === null && at.ticketId) return ledger.drop(key);
  const content = level ?? 'off';
  ledger.set({ [key]: { hash: contentHash(content), at: Date.now(), by: 'trail lead', content } });
}

/** The tracker file a trail's or ticket's level is written in, when the tracker is files. */
export function levelFile(root: string, mapId: string, ticketId?: string): string | undefined {
  const rel = ticketId ? `${mapId}/tickets/${ticketId}.md` : `${mapId}/map.md`;
  return existsSync(path.join(root, rel)) ? rel : undefined;
}
