import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contentHash } from '../trust/trustLedger';
import { oversizedFile } from './cachedFields';
import { codecOf, fieldsOfText } from './itemCodec';
import { judgeItem } from './judgeItem';
import { keepOutsideMapText } from './outsideMapText';
import { projectSigned } from './projectSigned';
import { staleWrite } from './staleWrite';
import { changedKeys, fieldsHash, sameValue, type Fields } from './stateFields';
import type { StateItem } from './stateItem';
import { entriesToChange, withStateLock, writeStateRecord, type StateEntry } from './stateRecord';
import { refuseLinks, writeTrackerFile } from './trackerFileWrite';

export interface SignedWrite {
  /** The tracker folder. */
  root: string;
  item: StateItem;
  /** The file as the writer means it: built from what Teamtrail showed it (effectiveText.ts). */
  text: string;
  /** Who is writing (StateEntry.by). */
  by: string;
  /**
   * The file as the writer read it (effectiveText.ts), before its change. Gate fields that differ between it and
   * `text` are the writer's change; one that changed since it was read refuses the write (staleWrite.ts). Without
   * it, what Teamtrail shows now is taken as what the writer read.
   */
  base?: string;
}

/** The file on disk, read only where no link stands; undefined when it is gone or too large to read whole. */
function readIfThere(root: string, rel: string): string | undefined {
  refuseLinks(root, rel);
  const file = path.join(root, rel);
  if (oversizedFile(file)) return undefined;
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** The record entry for what was written: its fields, and its text where showing or restoring it needs that. */
function entryFor(w: SignedWrite, f: Fields, written: string, was?: StateEntry): StateEntry {
  const codec = codecOf(w.item);
  const value = codec.parse(written);
  const entry: StateEntry = { f, h: fieldsHash(f), file: contentHash(written), by: w.by, at: Date.now() };
  if (w.item.kind === 'ticket') entry.title = (value as { title: string }).title;
  // a trail's text as signed, for its destination and assumption lines (signedMapText.ts): the writer's, which
  // never carries an outside change it didn't make (outsideMapText.ts keeps those in the file only)
  if (w.item.kind === 'map') entry.text = w.text;
  if (w.item.kind === 'decision') {
    const exact = !changedKeys(codec.fields(value), f).length;
    entry.text = exact ? written : was?.text;
  }
  return entry;
}

/** The gate fields the writer saw: those of the text it read, else what Teamtrail shows now. */
function seenBy(w: SignedWrite, shown: Fields): Fields {
  return (w.base === undefined ? undefined : fieldsOfText(w.item, w.base)) ?? shown;
}

/**
 * What to write and sign. The writer changed the gate fields that differ from what it read; those are signed as
 * theirs, unless one of them changed since it read it (refused: it would undo a change it never saw). The fields
 * it left alone keep what the file has, so a change it never saw is neither undone nor, when it came from outside
 * Teamtrail, signed: it still waits for the human.
 */
function plan(w: SignedWrite, raw: string | undefined, was: StateEntry | undefined) {
  const after = fieldsOfText(w.item, w.text);
  if (!after) throw new Error(`${w.item.rel} can't be read back as a ${w.item.kind}`);
  if (raw === undefined && !was) return { written: w.text, fields: after };
  const rawFields = raw === undefined ? undefined : fieldsOfText(w.item, raw);
  const strict = projectSigned(w.root);
  const judged = judgeItem({ kind: w.item.kind, entry: was, raw: rawFields, text: raw, strict });
  if (!judged.base || !judged.shown || judged.held)
    throw new Error(
      `${w.item.rel} was written outside Teamtrail and isn't signed here: accept or revert it in Settings → Approvals first.`,
    );
  const seen = seenBy(w, judged.shown);
  const changed = changedKeys(after, seen);
  const moved = changedKeys(judged.shown, seen);
  const clash = changed.filter((k) => moved.includes(k));
  if (clash.length) throw staleWrite(w.item.rel, clash);
  const keep = Object.entries(rawFields ?? {}).filter(([k, v]) => !changed.includes(k) && !sameValue(v, after[k]));
  const codec = codecOf(w.item);
  const kept = keep.length ? codec.serialize(codec.apply(codec.parse(w.text), Object.fromEntries(keep))) : w.text;
  const outsideText = w.item.kind === 'map' && raw !== undefined && !!was;
  const written = outsideText ? keepOutsideMapText({ mapId: w.item.mapId, written: kept, raw, changed }) : kept;
  const fields: Fields = { ...judged.base };
  for (const k of changed) {
    if (k in after) fields[k] = after[k];
    else delete fields[k];
  }
  return { written, fields };
}

/**
 * Writes a trail's map, a ticket or a decision as Teamtrail, and signs the change in the trail's record: both
 * under the trail's lock, so writers in other processes never lose each other's records. `create` writes only a
 * file that isn't there (false when one is), for new numbered tickets and decisions. Never through a symbolic
 * link (trackerFileWrite.ts).
 */
export function signedWrite(w: SignedWrite, mode: { create?: boolean } = {}): boolean {
  const { root, item } = w;
  return withStateLock(root, item.mapId, () => {
    const raw = readIfThere(root, item.rel);
    if (mode.create && raw !== undefined) return false;
    const entries = entriesToChange(root, item.mapId);
    const was = entries[item.key];
    const { written, fields } = plan(w, mode.create ? undefined : raw, mode.create ? undefined : was);
    if (!writeTrackerFile({ root, rel: item.rel, text: written, create: mode.create })) return false;
    entries[item.key] = entryFor(w, fields, written, was);
    writeStateRecord(root, item.mapId, entries);
    return true;
  });
}
