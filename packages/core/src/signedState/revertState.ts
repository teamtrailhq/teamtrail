import { readFileSync } from 'node:fs';
import path from 'node:path';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import type { MapDoc } from '../model/types';
import { itemFiles } from '../trust/itemFiles';
import { contentHash } from '../trust/trustLedger';
import { effectiveText } from './effectiveText';
import { codecOf } from './itemCodec';
import type { OutsideChange } from './outsideChanges';
import { withSignedMapText } from './signedMapText';
import { fieldsHash } from './stateFields';
import { stateApprovals } from './stateItems';
import { entriesToChange, withStateLock, writeStateRecord, type StateEntry } from './stateRecord';
import { refuseLinks, removeTrackerFile, writeTrackerFile } from './trackerFileWrite';

/** The file as it was signed: its gate fields put back (a decision's words from the record), or the removed file. */
function restored(root: string, c: OutsideChange, raw: string | undefined, entry?: StateEntry): string | undefined {
  if (raw === undefined) return entry ? effectiveText(root, c, undefined).text : undefined;
  const codec = codecOf(c);
  const from = c.kind === 'decision' && c.fields.includes('words') && entry?.text ? entry.text : raw;
  const parsed = codec.parse(from);
  const value = c.kind === 'map' ? withSignedMapText(c, parsed as MapDoc, entry) : parsed;
  return codec.serialize(codec.apply(value, c.counts!));
}

/** The file on disk, read only where no link stands (a link is refused, never followed). */
function readRaw(root: string, c: OutsideChange): string | undefined {
  refuseLinks(root, c.rel);
  if (c.fields.includes('oversized')) return undefined;
  try {
    return readFileSync(path.join(root, c.rel), 'utf8');
  } catch {
    return undefined;
  }
}

function restoreOne(root: string, c: OutsideChange, by: string) {
  withStateLock(root, c.mapId, () => {
    const raw = readRaw(root, c);
    const entries = entriesToChange(root, c.mapId);
    const was = entries[c.key];
    const text = restored(root, c, raw, was);
    if (text === undefined) return;
    writeTrackerFile({ root, rel: c.rel, text });
    const f = was?.f ?? c.counts!;
    entries[c.key] = { ...was, f, h: fieldsHash(f), file: contentHash(text), by: `reverted by ${by}`, at: Date.now() };
    writeStateRecord(root, c.mapId, entries);
  });
}

const sameList = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export interface RevertInput {
  root: string;
  key: string;
  /** The hash the page showed (stateItems.ts): if the files changed since, nothing is written. */
  hash: string;
  by: string;
  /** For files nobody signed (`revert: 'delete'`): the files the human confirmed deleting, by name. */
  remove?: string[];
}

/**
 * The trail lead reverts an outside change on this machine: Teamtrail writes the signed values back into the file
 * (a removed ticket or decision comes back from the record), or deletes files nobody signed here once the human
 * named each of them (`remove`). Never through a symbolic link. Journaled under `_trust`.
 */
export function revertState(input: RevertInput) {
  const { root, key, hash, by } = input;
  const found = stateApprovals(root).find((a) => a.item.key === key);
  if (!found) throw new Error('That change is gone: nothing to revert.');
  const { item, changes } = found;
  if (item.hash !== hash) throw new Error('That file changed since you looked at it: review it again.');
  if (item.revert === 'none' || !item.revert)
    throw new Error('This change can’t be reverted here: accept it, or restore the files from git.');
  if (item.revert === 'delete') {
    const files = itemFiles(item);
    if (!input.remove || !sameList(input.remove, files))
      throw new Error(`Name the files to delete to confirm: ${files.join(', ')}`);
    for (const f of files) removeTrackerFile(root, f);
  } else {
    for (const c of changes) restoreOne(root, c, by);
  }
  journalFile(root).append({
    v: 1,
    kind: 'trust',
    at: Date.now(),
    mapId: TRUST_JOURNAL,
    action: 'reverted',
    subject: item.title,
    detail: item.hash,
    actor: by,
    actorKind: 'trail lead',
  });
}
