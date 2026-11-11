import { statSync, readFileSync } from 'node:fs';
import { fieldsOfText } from './itemCodec';
import type { Fields } from './stateFields';
import type { StateItem } from './stateItem';

/** The last text seen per file, with its fields: a trail is read far more often than it changes. */
const seen = new Map<string, { text: string; fields?: Fields }>();

/** The gate fields of an item's text, parsed once per version of the text. */
export function cachedFields(item: StateItem, text: string): Fields | undefined {
  const hit = seen.get(item.rel);
  if (hit?.text === text) return hit.fields;
  const fields = fieldsOfText(item, text);
  seen.set(item.rel, { text, fields });
  return fields;
}

const texts = new Map<string, { stamp: string; text: string }>();

/** A file's text, read again only when its inode, time or size changed; undefined when it is gone. */
export function cachedText(file: string): string | undefined {
  const s = statSync(file, { throwIfNoEntry: false });
  if (!s?.isFile()) return undefined;
  const stamp = `${s.ino}:${s.mtimeMs}:${s.size}`;
  const hit = texts.get(file);
  if (hit?.stamp === stamp) return hit.text;
  const text = readFileSync(file, 'utf8');
  texts.set(file, { stamp, text });
  return text;
}
