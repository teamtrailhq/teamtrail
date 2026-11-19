import type { ReadText } from './types';

/**
 * The folders under `dir` that hold a changed file and are packages (one of `markers` there, before or after the
 * work): a workspace run (`npm test -ws`, `turbo run test`, `nx run-many`) can only have changed what it runs in
 * those. Deepest first, as found.
 */
export async function changedPackages(o: {
  changed: string[];
  dir: string;
  markers: string[];
  before: ReadText;
  after: ReadText;
}): Promise<string[]> {
  const folders = new Set<string>();
  const depth = o.dir ? o.dir.split('/').length : 0;
  for (const f of o.changed) {
    if (o.dir && !f.startsWith(`${o.dir}/`)) continue;
    const parts = f.split('/').slice(0, -1);
    for (let n = parts.length; n > depth; n--) folders.add(parts.slice(0, n).join('/'));
  }
  const out: string[] = [];
  for (const folder of folders) {
    for (const marker of o.markers) {
      const rel = `${folder}/${marker}`;
      if ((await o.before(rel)) == null && (await o.after(rel)) == null) continue;
      out.push(folder);
      break;
    }
  }
  return out;
}
