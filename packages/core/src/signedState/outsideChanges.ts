import { readdirSync } from 'node:fs';
import path from 'node:path';
import { cachedFields, cachedText } from './cachedFields';
import { judgeItem } from './judgeItem';
import { removedFiles } from './removedFiles';
import type { Fields } from './stateFields';
import { stateItemOf, type StateItem } from './stateItem';
import { readStateRecord } from './stateRecord';

/** One item whose gate fields in its file don't count on this machine. */
export interface OutsideChange extends StateItem {
  /** The gate fields that differ (`removed`: the file is gone). */
  fields: string[];
  /** What counts now: the signed values, or what an unsigned item may claim; undefined: nothing (a decision). */
  counts?: Fields;
  /** What the file says; undefined when it was removed. */
  file?: Fields;
  /** Whether this machine ever signed the item. */
  signed: boolean;
  /** The file's text, where accepting needs it (a decision's words). */
  text?: string;
}

export interface OutsideChanges {
  /** Records that can't be read, each said once. */
  problems: string[];
  changes: OutsideChange[];
  /** Items whose text, and only text, changed since Teamtrail wrote them: allowed, and shown as such. */
  textEdits: StateItem[];
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every trail's map, ticket and decision files in the tracker folder, relative to it. */
function trailFiles(root: string): string[] {
  const trails = listDir(root).filter((d) => !d.startsWith('.') && cachedText(path.join(root, d, 'map.md')));
  return trails.flatMap((mapId) => [
    `${mapId}/map.md`,
    ...listDir(path.join(root, mapId, 'tickets')).map((f) => `${mapId}/tickets/${f}`),
    ...listDir(path.join(root, mapId, 'decisions')).map((f) => `${mapId}/decisions/${f}`),
  ]);
}

function judgeFile(root: string, item: StateItem, out: OutsideChanges) {
  const entry = readStateRecord(root, item.mapId).entries[item.key];
  const text = cachedText(path.join(root, item.rel));
  const file = text === undefined ? undefined : cachedFields(item, text);
  if (text !== undefined && !file) return;
  const judged = judgeItem({ kind: item.kind, entry, raw: file, text });
  if (judged.textEdited) out.textEdits.push(item);
  if (!judged.outside.length) return;
  const keep = item.kind === 'decision' && text !== undefined ? { text } : {};
  out.changes.push({ ...item, fields: judged.outside, counts: judged.base, file, signed: !!entry, ...keep });
}

/**
 * What in the tracker folder was changed outside Teamtrail on this machine: by an agent editing files, a teammate's
 * push, a fresh clone. Read from the files and the trails' signed records only; each file is parsed again only
 * when it changed (cachedFields.ts).
 */
export function outsideChanges(root: string): OutsideChanges {
  const out: OutsideChanges = { problems: [], changes: [], textEdits: [] };
  const files = trailFiles(root);
  const items = [...files, ...removedFiles(root, files)].flatMap((rel) => stateItemOf(rel) ?? []);
  for (const mapId of new Set(items.map((i) => i.mapId))) {
    const problem = readStateRecord(root, mapId).problem;
    if (problem) out.problems.push(problem);
  }
  for (const item of items) judgeFile(root, item, out);
  return out;
}
