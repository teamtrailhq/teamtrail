import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentHash } from '../trust/trustLedger';
import { codecOf, fieldsOfText } from './itemCodec';
import { judgeItem } from './judgeItem';
import { changedKeys, fieldsHash, sameValue, type Fields } from './stateFields';
import type { StateItem } from './stateItem';
import { entriesToChange, withStateLock, writeStateRecord, type StateEntry } from './stateRecord';

export interface SignedWrite {
  /** The tracker folder. */
  root: string;
  item: StateItem;
  /** The file as the writer means it: built from what Teamtrail showed it (effectiveText.ts). */
  text: string;
  /** Who is writing (StateEntry.by). */
  by: string;
}

function readIfThere(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** The record entry for what was written: its fields, and its text where restoring it needs that. */
function entryFor(w: SignedWrite, f: Fields, written: string, was?: StateEntry): StateEntry {
  const codec = codecOf(w.item);
  const value = codec.parse(written);
  const entry: StateEntry = { f, h: fieldsHash(f), file: contentHash(written), by: w.by, at: Date.now() };
  if (w.item.kind === 'ticket') entry.title = (value as { title: string }).title;
  if (w.item.kind === 'decision') {
    const exact = !changedKeys(codec.fields(value), f).length;
    entry.text = exact ? written : was?.text;
  }
  return entry;
}

/**
 * What to write and sign. The writer changed the gate fields that differ from what it was shown; those are signed
 * as theirs. The fields it left alone keep what the file has, so an outside change it never saw is neither
 * signed nor silently undone: it still waits for the human.
 */
function plan(w: SignedWrite, raw: string | undefined, was: StateEntry | undefined) {
  const after = fieldsOfText(w.item, w.text);
  if (!after) throw new Error(`${w.item.rel} can't be read back as a ${w.item.kind}`);
  if (raw === undefined && !was) return { written: w.text, fields: after };
  const rawFields = raw === undefined ? undefined : fieldsOfText(w.item, raw);
  const judged = judgeItem({ kind: w.item.kind, entry: was, raw: rawFields, text: raw });
  if (!judged.base || !judged.shown)
    throw new Error(
      `${w.item.rel} was written outside Teamtrail and isn't signed here: accept or revert it in Settings → Approvals first.`,
    );
  const changed = changedKeys(after, judged.shown);
  const keep = Object.entries(rawFields ?? {}).filter(([k, v]) => !changed.includes(k) && !sameValue(v, after[k]));
  const codec = codecOf(w.item);
  const written = keep.length ? codec.serialize(codec.apply(codec.parse(w.text), Object.fromEntries(keep))) : w.text;
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
 * file that isn't there (false when one is), for new numbered tickets and decisions.
 */
export function signedWrite(w: SignedWrite, mode: { create?: boolean } = {}): boolean {
  const { root, item } = w;
  return withStateLock(root, item.mapId, () => {
    const file = path.join(root, item.rel);
    const raw = readIfThere(file);
    if (mode.create && raw !== undefined) return false;
    const entries = entriesToChange(root, item.mapId);
    const was = entries[item.key];
    const { written, fields } = plan(w, mode.create ? undefined : raw, mode.create ? undefined : was);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, written, mode.create ? { flag: 'wx' } : undefined);
    entries[item.key] = entryFor(w, fields, written, was);
    writeStateRecord(root, item.mapId, entries);
    return true;
  });
}
