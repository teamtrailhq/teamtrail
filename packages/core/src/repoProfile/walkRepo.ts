import type { RepoEntry, RepoFiles } from '../model/checkScreening';
import { PROFILE_LIMITS } from './limits';
import { isSkippedFolder } from './skippedFolder';
import { TOP_NAMES } from './topNames';
import type { FolderView, ProfileReader } from './types';

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

function viewOf(dir: string, depth: number, entries: RepoEntry[]): FolderView {
  const files = new Set(entries.filter((e) => e.kind === 'file').map((e) => e.name));
  const dirs = new Set(entries.filter((e) => e.kind === 'dir').map((e) => e.name));
  return { dir, depth, files, dirs };
}

/** The top folder only, found by asking for each known name, when the files can't be listed. */
async function topOnly(files: RepoFiles, reader: ProfileReader): Promise<FolderView[]> {
  const entries: RepoEntry[] = [];
  for (const name of [...TOP_NAMES, '.github', 'spec', 'tests', 'test']) {
    const kind = await files.kind(name).catch(() => undefined);
    if (kind) entries.push({ name, kind });
  }
  reader.note(`top ${entries.map((e) => `${e.kind}:${e.name}`).join(',')}`);
  return [viewOf('', 0, entries)];
}

/**
 * The repo's folders, breadth first from the top: at most PROFILE_LIMITS.depth below it and PROFILE_LIMITS.folders
 * in all, skipping dependency, build and dot folders (skippedFolder.ts). Shallowest first, then by path, so the same
 * tree always gives the same walk. Without `list`, the top folder only.
 */
export async function walkRepo(files: RepoFiles, reader: ProfileReader): Promise<FolderView[]> {
  if (!files.list) return topOnly(files, reader);
  const out: FolderView[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: '', depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift()!;
    if (out.length >= PROFILE_LIMITS.folders) {
      reader.cut();
      break;
    }
    const entries = await files.list(dir).catch(() => undefined);
    if (!entries) continue;
    reader.note(`${dir}/ ${entries.map((e) => `${e.kind}:${e.name}`).join(',')}`);
    const view = viewOf(dir, depth, entries);
    out.push(view);
    const below = [...view.dirs].filter((d) => !isSkippedFolder(d)).sort();
    if (depth >= PROFILE_LIMITS.depth) continue;
    for (const d of below) queue.push({ dir: join(dir, d), depth: depth + 1 });
  }
  return out;
}
