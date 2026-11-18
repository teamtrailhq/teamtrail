import { parseFront, str } from '../../model/frontmatter';
import type { MarkdownFs } from './markdownFs';

/**
 * The next free issue number across trails and tickets, as a tracker would hand out: above every number the files
 * name, and, where the folder can hand them out (`reserveNumber`), never one it gave before, so trails and tickets
 * created at once in several processes never share a `#n`.
 */
export async function nextNumber(fs: MarkdownFs) {
  const files = await fs.list();
  const nums = files.filter((f) => !f.includes('/decisions/')).map((f) => Number(f.match(/(\d+)\.md$/)?.[1] ?? 0));
  const keys = await Promise.all(
    files
      .filter((f) => f.endsWith('/map.md'))
      .map(async (f) => Number(str(parseFront(await fs.read(f)).front.key).replace(/\D/g, '')) || 0),
  );
  const free = Math.max(0, ...nums, ...keys) + 1;
  return fs.reserveNumber ? fs.reserveNumber(free) : free;
}
