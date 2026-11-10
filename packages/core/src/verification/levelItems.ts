import { VERIFICATION_LEVELS, type VerificationLevel } from '../model/lifecycle';
import type { MapSnapshot, Ticket } from '../model/types';
import type { TrustItem } from '../trust/trustItem';
import { contentHash, trustKey, type TrustRecord } from '../trust/trustLedger';
import { levelFile } from './approvedLevel';
import { trustedChecks } from './checksApproval';

const rank = (l: VerificationLevel) => VERIFICATION_LEVELS.indexOf(l);
type Ledger = Record<string, TrustRecord>;

/**
 * One trail's or ticket's level against what this machine holds it to. Recorded: an item when the file lowers it.
 * Never recorded here: an item unless it is the approved default (which holds until the trail lead adopts another).
 */
function levelItem(
  ledger: Ledger,
  at: { key: string; level: VerificationLevel; what: string; held?: VerificationLevel },
) {
  const approved = ledger[at.key]?.content as VerificationLevel | undefined;
  if (approved && rank(at.level) >= rank(approved)) return undefined;
  if (!approved && (at.held === undefined || at.level === at.held)) return undefined;
  const standing = approved ? ('changed' as const) : ('elsewhere' as const);
  const title = approved ? `Verification of ${at.what} lowered` : `Verification of ${at.what}: adopt ${at.level}`;
  const lines = [`${approved ?? at.held} → ${at.level}`];
  return {
    key: at.key,
    kind: 'level' as const,
    hash: contentHash(at.level),
    content: at.level,
    standing,
    title,
    lines,
  };
}

/** A ticket whose type in its file differs from the type recorded here: the trail level applies by the recorded one. */
function typeItem(ledger: Ledger, mapId: string, t: Ticket) {
  const key = trustKey.type(mapId, t.id);
  const was = ledger[key]?.content;
  if (!was || was === t.type) return undefined;
  const item = { key, kind: 'type' as const, hash: contentHash(t.type), content: t.type, standing: 'changed' as const };
  return { ...item, title: `Type of ${t.key} changed`, lines: [`${was} → ${t.type}`], ticketId: t.id };
}

/** Levels and ticket types of the given trails that wait for the trail lead on this machine. */
export function levelItems(root: string, ledger: Ledger, snaps: MapSnapshot[]): TrustItem[] {
  const config = trustedChecks(root).config.config;
  if (!config) return [];
  return snaps.flatMap((s) => {
    const mapId = s.map.id;
    const level = s.map.verification ?? 'off';
    const trail = levelItem(ledger, {
      key: trustKey.level(mapId),
      level,
      what: `trail ${s.map.key}`,
      held: config.default,
    });
    const open = s.tickets.filter((t) => t.state === 'open');
    const tickets = open
      .filter((t) => t.verification)
      .map((t) => {
        const item = levelItem(ledger, { key: trustKey.level(mapId, t.id), level: t.verification!, what: t.key });
        return item && { ...item, ticketId: t.id };
      });
    const types = open.map((t) => typeItem(ledger, mapId, t));
    const withFile = [trail, ...tickets, ...types].flatMap((i) =>
      i ? [{ ...i, file: levelFile(root, mapId, 'ticketId' in i ? i.ticketId : undefined) }] : [],
    );
    return withFile.map((i) => ({ ...i, mapId, warnings: [] }) as TrustItem);
  });
}
