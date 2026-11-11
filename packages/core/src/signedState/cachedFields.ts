import { readFileSync, statSync } from 'node:fs';
import { fieldsOfText } from './itemCodec';
import type { Fields } from './stateFields';
import type { StateItem } from './stateItem';

/** Files larger than this are never read whole: they count as changed outside Teamtrail (`oversized`). */
export const MAX_ITEM_BYTES = 1024 * 1024;
/** Entries each cache keeps; the least recently used goes first. */
const MAX_ENTRIES = 2000;

/** A Map that keeps the `MAX_ENTRIES` most recently used keys. */
function lru<V>() {
  const map = new Map<string, V>();
  return {
    get(key: string) {
      const v = map.get(key);
      if (v === undefined) return undefined;
      map.delete(key);
      map.set(key, v);
      return v;
    },
    set(key: string, v: V) {
      map.delete(key);
      map.set(key, v);
      if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value!);
    },
  };
}

/** The last text seen per file, with its fields: a trail is read far more often than it changes. */
const seen = lru<{ text: string; fields?: Fields }>();

/** The gate fields of an item's text, parsed once per version of the text. */
export function cachedFields(item: StateItem, text: string): Fields | undefined {
  const hit = seen.get(item.rel);
  if (hit?.text === text) return hit.fields;
  const fields = fieldsOfText(item, text);
  seen.set(item.rel, { text, fields });
  return fields;
}

const texts = lru<{ stamp: string; text: string }>();

/** What a tracker file holds: its text, nothing (it is gone), or more than Teamtrail reads (`oversized`). */
export type FileText = string | undefined | { oversized: number };

export const isOversized = (t: FileText): t is { oversized: number } => typeof t === 'object';

/** A file's size when it is too large to read whole; undefined otherwise (also when it is gone). */
export function oversizedFile(file: string): number | undefined {
  const s = statSync(file, { throwIfNoEntry: false });
  return s?.isFile() && s.size > MAX_ITEM_BYTES ? s.size : undefined;
}

/** A file's text, read again only when its inode, time or size changed; never read whole above `MAX_ITEM_BYTES`. */
export function cachedText(file: string): FileText {
  const s = statSync(file, { throwIfNoEntry: false });
  if (!s?.isFile()) return undefined;
  if (s.size > MAX_ITEM_BYTES) return { oversized: s.size };
  const stamp = `${s.ino}:${s.mtimeMs}:${s.size}`;
  const hit = texts.get(file);
  if (hit?.stamp === stamp) return hit.text;
  const text = readFileSync(file, 'utf8');
  texts.set(file, { stamp, text });
  return text;
}
