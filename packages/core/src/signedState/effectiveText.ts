import type { MapDoc, Ticket } from '../model/types';
import { cachedFields } from './cachedFields';
import { codecOf } from './itemCodec';
import { judgeItem, type Judged } from './judgeItem';
import { projectSigned } from './projectSigned';
import { withSignedMapText } from './signedMapText';
import { changedKeys } from './stateFields';
import type { StateItem } from './stateItem';
import { readStateRecord, type StateEntry } from './stateRecord';

export interface Effective {
  /** The file as gates read it; undefined when it isn't an item that counts (a decision nobody signed). */
  text?: string;
  judged: Judged;
}

/** A ticket whose file was removed outside Teamtrail, from its record: it still blocks what it blocked. */
function removedTicket(item: StateItem, entry: StateEntry): Ticket {
  return {
    id: item.id,
    key: `#${item.id}`,
    title: entry.title ?? `Ticket #${item.id}`,
    type: 'task',
    body: 'Its file was removed outside Teamtrail. Restore it or accept the removal in Settings → Approvals.',
    state: 'open',
    blockedBy: [],
    comments: [],
    createdAt: entry.at,
    updatedAt: entry.at,
  };
}

/** The text a removed (or unreadable) ticket or decision reads as, from its record; undefined for a trail's map. */
export function removedText(item: StateItem, entry: StateEntry, judged: Judged): string | undefined {
  const codec = codecOf(item);
  if (item.kind === 'ticket') return codec.serialize(codec.apply(removedTicket(item, entry), judged.shown!));
  if (item.kind === 'decision' && entry.text) return codec.serialize(codec.apply(codec.parse(entry.text), entry.f));
  return undefined;
}

/**
 * The text a changed item reads as: its own text with the fields that count, a decision's signed words, and a
 * trail's signed assumptions where lines were deleted.
 */
export function signedText(item: StateItem, raw: string, entry: StateEntry | undefined, judged: Judged): string {
  const codec = codecOf(item);
  const reworded = item.kind === 'decision' && judged.outside.includes('words') && entry?.text;
  const parsed = codec.parse(reworded ? entry.text! : raw);
  const value = item.kind === 'map' ? withSignedMapText(item, parsed as MapDoc, entry) : parsed;
  return codec.serialize(codec.apply(value, judged.shown!));
}

/**
 * One tracker file as Teamtrail reads it on this machine: unchanged when it agrees with the trail's signed record
 * (or only its text changed), else with the signed gate fields put back; an item nobody signed in a project with
 * signed state is held (judgeItem.ts). `raw` undefined: the file is missing, or too large to read
 * (`oversized`), which reads as if it were removed.
 */
export function effectiveText(root: string, item: StateItem, raw: string | undefined): Effective {
  const record = readStateRecord(root, item.mapId);
  const entry = record.entries[item.key];
  const fields = raw === undefined ? undefined : cachedFields(item, raw);
  if (raw !== undefined && !fields) return { text: raw, judged: { outside: [], textEdited: false } };
  const judged = judgeItem({ kind: item.kind, entry, raw: fields, text: raw, strict: projectSigned(root) });
  if (!judged.base) return { judged };
  if (raw === undefined) return { text: removedText(item, entry!, judged), judged };
  if (!judged.outside.length || !changedKeys(fields!, judged.shown!).length) return { text: raw, judged };
  return { text: signedText(item, raw, entry, judged), judged };
}
