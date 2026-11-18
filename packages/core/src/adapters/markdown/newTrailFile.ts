import { DEFAULT_MAP_MODE, type MapDoc } from '../../model/types';
import type { MapInput } from '../adapter';
import { serializeMapFile } from './mapFile';
import type { MarkdownFs } from './markdownFs';
import { nextNumber } from './nextNumber';
import { trailSlug } from './paths';

/** Folders of the tracker that hold other things than trails: never a trail's name. */
const NOT_TRAILS = new Set(['briefs', 'criteria', 'knowledge', 'guides', 'proof-keys']);

const MAX_TRIES = 200;

/** Whether `id` names anything already: a trail's folder (archived or not, any file in it) or its brief or criteria. */
function taken(id: string, files: string[]): boolean {
  if (NOT_TRAILS.has(id)) return true;
  return files.some((f) => f.startsWith(`${id}/`) || f === `briefs/${id}.md` || f === `criteria/${id}.md`);
}

const mapDoc = (id: string, n: number, input: MapInput): MapDoc => ({
  id,
  key: `#${n}`,
  title: input.title,
  mode: input.mode ?? DEFAULT_MAP_MODE,
  ...(input.verification ? { verification: input.verification } : {}),
  sections: input.sections,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Writes a new trail's `map.md` in a folder of its own, named from its title: `<slug>`, else `<slug>-2`, `-3`, …
 * The first name nothing uses yet is tried, and created only if nobody has it (`MarkdownFs.create`; on this machine
 * only in a folder nothing is in, under the trail's lock, signedState/freeTrailFolder.ts), so a trail with the same title as
 * another, or a title that slugs the same, never writes into its folder, even when several processes create
 * trails at once. Existing trails keep their folders. A filesystem without exclusive create writes the first free
 * name. `writing` hears each path before it is written.
 */
export async function newTrailFile(fs: MarkdownFs, input: MapInput, writing: (path: string) => void): Promise<MapDoc> {
  const n = await nextNumber(fs);
  const slug = trailSlug(input.title, n);
  const files = await fs.list();
  for (let i = 1; i <= MAX_TRIES; i++) {
    const id = i === 1 ? slug : `${slug}-${i}`;
    if (taken(id, files)) continue;
    const map = mapDoc(id, n, input);
    const path = `${id}/map.md`;
    writing(path);
    if (!fs.create) {
      await fs.write(path, serializeMapFile(map));
      return map;
    }
    if (await fs.create(path, serializeMapFile(map))) return map;
  }
  throw new Error(`could not find a free folder for the trail ${JSON.stringify(slug)}`);
}
