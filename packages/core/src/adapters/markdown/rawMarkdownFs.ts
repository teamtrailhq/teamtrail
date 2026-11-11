import { mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { watchTree } from '../../lib/watchTree';
import type { MarkdownFs } from './markdownFs';

/** The tracker folder as plain files, read and written as they are. Teamtrail itself goes through `nodeMarkdownFs`, which signs what it writes; this is for that and for reading what is on disk. */
export function rawMarkdownFs(root: string): MarkdownFs {
  const abs = path.resolve(root);
  mkdirSync(abs, { recursive: true });
  const safe = (p: string) => {
    const full = path.resolve(abs, p);
    if (full !== abs && !full.startsWith(abs + path.sep)) throw new Error('path escapes root');
    return full;
  };
  async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(full)));
      else if (e.name.endsWith('.md')) out.push(path.relative(abs, full).split(path.sep).join('/'));
    }
    return out;
  }
  return {
    list: () => walk(abs),
    read: (p) => fs.readFile(safe(p), 'utf8'),
    async write(p, text) {
      await fs.mkdir(path.dirname(safe(p)), { recursive: true });
      await fs.writeFile(safe(p), text);
    },
    async create(p, text) {
      await fs.mkdir(path.dirname(safe(p)), { recursive: true });
      try {
        await fs.writeFile(safe(p), text, { flag: 'wx' });
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw e;
      }
    },
    watch: (cb) => watchTree(abs, cb),
  };
}
