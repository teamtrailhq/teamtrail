import type { RepoFiles } from '../../src/model/checkScreening';

/** A repo in memory for screening: repo-relative paths to file text; every folder above a file exists. */
export function memoryRepoFiles(files: Record<string, string>): RepoFiles & { reads: string[] } {
  const dirs = new Set<string>(['']);
  for (const f of Object.keys(files)) {
    const parts = f.split('/');
    for (let n = 1; n < parts.length; n++) dirs.add(parts.slice(0, n).join('/'));
  }
  const reads: string[] = [];
  return {
    reads,
    async read(rel) {
      reads.push(rel);
      return files[rel];
    },
    async kind(rel) {
      if (rel in files) return 'file';
      return dirs.has(rel) ? 'dir' : undefined;
    },
    async list(rel) {
      if (!dirs.has(rel)) return undefined;
      const prefix = rel ? `${rel}/` : '';
      const names = new Set<string>();
      for (const p of [...Object.keys(files), ...dirs]) {
        if (p.startsWith(prefix) && p !== rel) names.add(p.slice(prefix.length).split('/')[0]);
      }
      return [...names]
        .sort()
        .map((name) => ({ name, kind: dirs.has(prefix + name) ? ('dir' as const) : ('file' as const) }));
    },
  };
}
