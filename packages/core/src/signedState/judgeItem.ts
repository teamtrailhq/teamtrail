import { contentHash } from '../trust/trustLedger';
import { ASSUMPTION_PREFIX, changedKeys, MAP_KEYS, PROGRESS_KEYS, type Fields } from './stateFields';
import type { StateItemKind } from './stateItem';
import type { StateEntry } from './stateRecord';

/** An item's file against its record. */
export interface Judged {
  /** The gate fields that count: the signed ones, or what an unsigned item may claim. Undefined: not an item at all. */
  base?: Fields;
  /** `base` as gates read it: a ticket with outside changes, or one nobody signed, is also held for the human. */
  shown?: Fields;
  /** The gate fields the file has that don't count (`removed`: the file is gone; `added`: nobody signed it). */
  outside: string[];
  /** Only the text changed since Teamtrail wrote the file. */
  textEdited: boolean;
  /** Nobody signed it here, and the project has signed state: added outside Teamtrail, it waits as a whole. */
  held?: boolean;
  /** A signed trail's assumptions nobody signed: added outside Teamtrail, each read as `holding` until accepted. */
  unsigned?: string[];
}

export interface JudgeInput {
  kind: StateItemKind;
  entry?: StateEntry;
  /** The file's gate fields; undefined: the file is gone. */
  raw?: Fields;
  /** The file, to tell a text edit from Teamtrail's own. */
  text?: string;
  /** The project has signed state (projectSigned.ts): an item nobody signed is held, not adopted as it is. */
  strict?: boolean;
}

/** Statuses only the human (confirmed) or an approved reroute (invalidated) give an assumption. */
const DECIDED_ASSUMPTION = new Set(['confirmed', 'invalidated']);

/** A ticket nobody signed: as created (type, blockers, guide), and nothing happened to it yet. */
export function unsignedTicket(raw: Fields): Fields {
  const neutral = Object.fromEntries(PROGRESS_KEYS.map((k) => [k, null]));
  return { ...raw, ...neutral, state: 'open' };
}

/**
 * A ticket added outside Teamtrail, as gates read it until the human accepts it: held (blocked, so nobody claims
 * it), needing the human (hitl), and at least as strict as a junction, whatever its file says.
 */
const heldTicket = (base: Fields): Fields => ({ ...base, type: 'junction', hitl: true, status: 'blocked' });

/** A trail nobody signed: its settings as written, no assumption the human decided. */
function unsignedMap(raw: Fields): Fields {
  const undecided = Object.entries(raw).map(([k, v]) =>
    k.startsWith(ASSUMPTION_PREFIX) && DECIDED_ASSUMPTION.has(String(v)) ? [k, 'holding'] : [k, v],
  );
  return Object.fromEntries(undecided) as Fields;
}

/** A signed trail's assumptions that its record doesn't have: added outside Teamtrail. */
const unsignedAssumptions = (signed: Fields, raw: Fields) =>
  Object.keys(raw).filter((k) => k.startsWith(ASSUMPTION_PREFIX) && !(k in signed));

/**
 * The signed fields of a trail. An assumption new in the file counts as no more than `holding` (`unsignedAssumptions`
 * lists it as a change); one deleted from it still counts.
 */
function signedMap(signed: Fields, raw: Fields): Fields {
  const keep = (k: string) => (MAP_KEYS as readonly string[]).includes(k) || k.startsWith(ASSUMPTION_PREFIX);
  const kept = Object.fromEntries(Object.entries(signed).filter(([k]) => keep(k)));
  const added = Object.fromEntries(unsignedAssumptions(signed, raw).map((k) => [k, 'holding']));
  return { ...unsignedMap(raw), ...added, ...kept };
}

/** A map or a ticket nobody signed on this machine. */
function judgeUnsigned(input: JudgeInput & { raw: Fields }): Judged {
  const { kind, raw, strict } = input;
  const base = kind === 'map' ? unsignedMap(raw) : unsignedTicket(raw);
  const differs = changedKeys(raw, base);
  const outside = ['added', ...differs];
  if (kind !== 'ticket') return { base, shown: base, outside, textEdited: false, held: !!strict };
  if (strict) return { base, shown: heldTicket(base), outside, textEdited: false, held: true };
  const shown = differs.length ? { ...base, status: 'blocked' } : base;
  return { base, shown, outside, textEdited: false };
}

/**
 * How one item's file stands against the record: which gate fields count, which don't, and whether only its text
 * changed.
 */
export function judgeItem(input: JudgeInput): Judged {
  const { kind, entry, raw } = input;
  if (!raw) {
    if (!entry) return { outside: [], textEdited: false };
    const held = kind === 'ticket' ? { ...entry.f, status: 'blocked' } : entry.f;
    return { base: entry.f, shown: held, outside: ['removed'], textEdited: false };
  }
  if (!entry && kind !== 'decision') return judgeUnsigned({ ...input, raw });
  // A decision nobody signed isn't one.
  if (!entry) return { outside: ['added', ...Object.keys(raw).sort()], textEdited: false, held: !!input.strict };
  const base = kind === 'map' ? signedMap(entry.f, raw) : entry.f;
  const unsigned = kind === 'map' ? unsignedAssumptions(entry.f, raw) : [];
  const outside = [...new Set([...changedKeys(raw, base), ...unsigned])].sort();
  const held = kind === 'ticket' && outside.length > 0;
  const shown = held ? { ...base, status: 'blocked' } : base;
  const textEdited =
    !outside.length && !!entry.file && input.text !== undefined && entry.file !== contentHash(input.text);
  return { base, shown, outside, textEdited, ...(unsigned.length ? { unsigned } : {}) };
}
