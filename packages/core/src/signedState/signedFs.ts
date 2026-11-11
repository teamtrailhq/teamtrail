import path from 'node:path';
import type { MarkdownFs } from '../adapters/markdown/markdownFs';
import { oversizedFile } from './cachedFields';
import { effectiveText } from './effectiveText';
import { removedFiles } from './removedFiles';
import { signedWrite } from './signedWrite';
import { stateItemOf } from './stateItem';
import { writerDone } from './writerDone';

const notFound = (p: string) => Object.assign(new Error(`not found: ${p}`), { code: 'ENOENT' });

/** The file as it is on disk; undefined when it is gone, or too large to read whole (cachedFields.ts). */
async function readRaw(root: string, inner: MarkdownFs, p: string): Promise<string | undefined> {
  if (oversizedFile(path.join(root, p))) return undefined;
  try {
    return await inner.read(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/**
 * The tracker folder as Teamtrail on this machine sees it (`root` is its absolute path):
 * - reading a trail's map, a ticket or a decision gives it with the gate fields that count (effectiveText.ts): an
 *   outside change reads as the signed value, a decision nobody signed isn't there, a removed ticket still is;
 * - writing one signs the change as `by`'s (signedWrite.ts), against the text the writer read (`base`);
 * - every other file (briefs, criteria, knowledge, guides) passes through as it is.
 * The Lookout's file route and every Teamtrail process on this machine use it, so every write they make is signed
 * and every read applies the same rules.
 */
export function signedFs(root: string, inner: MarkdownFs, by: () => string): MarkdownFs {
  return {
    async list() {
      const files = await inner.list();
      return [...files, ...removedFiles(root, files)];
    },
    async read(p) {
      const item = stateItemOf(p);
      if (!item) return inner.read(p);
      let seen = effectiveText(root, item, await readRaw(root, inner, p));
      // what looks changed outside Teamtrail may be a write of its own between the file and its record: read it
      // again once that write is done, or the reader keeps the old values until something else changes
      if (seen.judged.outside.length) {
        await writerDone(root, item.mapId);
        seen = effectiveText(root, item, await readRaw(root, inner, p));
      }
      const { text } = seen;
      if (text === undefined) throw notFound(p);
      return text;
    },
    async write(p, text, opts) {
      const item = stateItemOf(p);
      if (!item) return inner.write(p, text, opts);
      signedWrite({ root, item, text, by: by(), base: opts?.base });
    },
    async create(p, text) {
      const item = stateItemOf(p);
      if (!item) return inner.create ? inner.create(p, text) : (await inner.write(p, text), true);
      return signedWrite({ root, item, text, by: by() }, { create: true });
    },
    ...(inner.watch ? { watch: inner.watch } : {}),
  };
}
