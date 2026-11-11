import { contentHash } from '../trust/trustLedger';
import { ASSUMPTION_PREFIX, changedKeys, MAP_KEYS, PROGRESS_KEYS, type Fields } from './stateFields';
import type { StateItemKind } from './stateItem';
import type { StateEntry } from './stateRecord';

/** An item's file against its record. */
export interface Judged {
  /** The gate fields that count: the signed ones, or what an unsigned item may claim. Undefined: not an item at all. */
  base?: Fields;
  /** `base` as gates read it: a ticket with outside changes is also held for the human. */
  shown?: Fields;
  /** The gate fields the file has that don't count (`removed` when the file is gone). */
  outside: string[];
  /** Only the text changed since Teamtrail wrote the file. */
  textEdited: boolean;
}

/** Statuses only the human (confirmed) or an approved reroute (invalidated) give an assumption. */
const DECIDED_ASSUMPTION = new Set(['confirmed', 'invalidated']);

/** A ticket nobody signed: as created (type, blockers, guide), and nothing happened to it yet. */
export function unsignedTicket(raw: Fields): Fields {
  const neutral = Object.fromEntries(PROGRESS_KEYS.map((k) => [k, null]));
  return { ...raw, ...neutral, state: 'open' };
}

/** A trail nobody signed: its settings as written, no assumption the human decided. */
function unsignedMap(raw: Fields): Fields {
  const undecided = Object.entries(raw).map(([k, v]) =>
    k.startsWith(ASSUMPTION_PREFIX) && DECIDED_ASSUMPTION.has(String(v)) ? [k, 'holding'] : [k, v],
  );
  return Object.fromEntries(undecided) as Fields;
}

/** The signed fields of a trail, for the assumptions still in its file; a new one counts as unsigned. */
function signedMap(signed: Fields, raw: Fields): Fields {
  const keep = (k: string) => (MAP_KEYS as readonly string[]).includes(k) || k in raw;
  const kept = Object.fromEntries(Object.entries(signed).filter(([k]) => keep(k)));
  return { ...unsignedMap(raw), ...kept };
}

function baseOf(kind: StateItemKind, entry: StateEntry | undefined, raw: Fields): Fields | undefined {
  if (kind === 'map') return entry ? signedMap(entry.f, raw) : unsignedMap(raw);
  if (kind === 'ticket') return entry ? entry.f : unsignedTicket(raw);
  return entry?.f;
}

/**
 * How one item's file stands against the record: which gate fields count, which don't, and whether only its text
 * changed. `raw` undefined means the file is gone; `text` is the file, to tell a text edit from Teamtrail's own.
 */
export function judgeItem(input: { kind: StateItemKind; entry?: StateEntry; raw?: Fields; text?: string }): Judged {
  const { kind, entry, raw } = input;
  if (!raw) {
    if (!entry) return { outside: [], textEdited: false };
    const held = kind === 'ticket' ? { ...entry.f, status: 'blocked' } : entry.f;
    return { base: entry.f, shown: held, outside: ['removed'], textEdited: false };
  }
  const base = baseOf(kind, entry, raw);
  if (!base) return { outside: Object.keys(raw).sort(), textEdited: false };
  const outside = changedKeys(raw, base);
  const held = kind === 'ticket' && outside.length > 0;
  const shown = held ? { ...base, status: 'blocked' } : base;
  const textEdited =
    !outside.length && !!entry?.file && input.text !== undefined && entry.file !== contentHash(input.text);
  return { base, shown, outside, textEdited };
}
