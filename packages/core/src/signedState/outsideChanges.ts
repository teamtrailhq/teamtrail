import { readdirSync } from 'node:fs';
import path from 'node:path';
import { cachedFields, cachedText, isOversized } from './cachedFields';
import { judgeItem } from './judgeItem';
import { projectSigned } from './projectSigned';
import { removedFiles, removedTrails } from './removedFiles';
import type { Fields } from './stateFields';
import { stateItemOf, type StateItem } from './stateItem';
import { readStateRecord } from './stateRecord';

/** One item whose gate fields in its file don't count on this machine. */
export interface OutsideChange extends StateItem {
  /** The gate fields that differ (`removed`: the file is gone; `added`: nobody signed it; `oversized`: too large). */
  fields: string[];
  /** What counts now: the signed values, or what an unsigned item may claim; undefined: nothing (a decision). */
  counts?: Fields;
  /** What the file says; undefined when it was removed. */
  file?: Fields;
  /** Whether this machine ever signed the item. */
  signed: boolean;
  /** The file's text, where showing or accepting needs it (a decision's words, a trail's destination). */
  text?: string;
  /** A decision's or trail's file as Teamtrail last wrote it: what a rewording is shown against. */
  signedText?: string;
  /** A signed trail's assumptions nobody signed (`assumption:S-<n>`): added outside Teamtrail. */
  unsigned?: string[];
  /** Its trail's record can't be read, so a signed item may show as one nobody signed. */
  unreadable?: boolean;
  /** A whole trail removed (`fields: ['removed']` on its map): how many tickets and decisions its record holds. */
  trail?: { tickets: number; decisions: number };
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

function judgeFile(root: string, item: StateItem, strict: boolean, out: OutsideChanges) {
  const record = readStateRecord(root, item.mapId);
  const entry = record.entries[item.key];
  const unreadable = record.problem ? { unreadable: true } : {};
  const text = cachedText(path.join(root, item.rel));
  if (isOversized(text)) {
    out.changes.push({ ...item, fields: ['oversized'], counts: entry?.f, signed: !!entry, ...unreadable });
    return;
  }
  const file = text === undefined ? undefined : cachedFields(item, text);
  if (text !== undefined && !file) return;
  const judged = judgeItem({ kind: item.kind, entry, raw: file, text, strict });
  if (judged.textEdited) out.textEdits.push(item);
  if (!judged.outside.length) return;
  const signedText = entry?.text ? { signedText: entry.text } : {};
  const keep = item.kind !== 'ticket' && text !== undefined ? { text, ...signedText } : {};
  const signed = !!entry;
  const unsigned = judged.unsigned ? { unsigned: judged.unsigned } : {};
  out.changes.push({
    ...item,
    fields: judged.outside,
    counts: judged.base,
    file,
    signed,
    ...keep,
    ...unreadable,
    ...unsigned,
  });
}

/** A trail whose map is gone, as one change: its record holds what it had. */
function removedTrail(root: string, mapId: string): OutsideChange {
  const entries = readStateRecord(root, mapId).entries;
  const count = (kind: string) => Object.keys(entries).filter((k) => k.startsWith(`${kind}:`)).length;
  const item = stateItemOf(`${mapId}/map.md`)!;
  const trail = { tickets: count('ticket'), decisions: count('decision') };
  return { ...item, fields: ['removed'], counts: entries.map?.f, signed: true, trail };
}

/**
 * What in the tracker folder was changed outside Teamtrail on this machine: by an agent editing files, a teammate's
 * push, a fresh clone, a trail renamed or removed. Read from the files and the trails' signed records only; each
 * file is parsed again only when it changed (cachedFields.ts).
 */
export function outsideChanges(root: string): OutsideChanges {
  const out: OutsideChanges = { problems: [], changes: [], textEdits: [] };
  const strict = projectSigned(root);
  const files = trailFiles(root);
  const items = [...files, ...removedFiles(root, files)].flatMap((rel) => stateItemOf(rel) ?? []);
  const gone = removedTrails(root, files);
  for (const mapId of new Set([...items.map((i) => i.mapId), ...gone])) {
    const problem = readStateRecord(root, mapId).problem;
    if (problem) out.problems.push(problem);
  }
  for (const item of items) judgeFile(root, item, strict, out);
  for (const mapId of gone) out.changes.push(removedTrail(root, mapId));
  return out;
}
