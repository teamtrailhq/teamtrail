import path from 'node:path';

/** The repo a tracker folder belongs to: its parent when the folder is hidden (`.teamtrail`), else the folder. */
export function repoOfRoot(root: string): string {
  const abs = path.resolve(root);
  return path.basename(abs).startsWith('.') ? path.dirname(abs) : abs;
}

/** What the Lookout calls a project: the repo folder's name. */
export function projectName(root: string): string {
  return path.basename(repoOfRoot(root)) || 'repo';
}
