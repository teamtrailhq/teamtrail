/**
 * A repo-relative path from a folder and a path inside it, with `/` separators: `.` and empty parts dropped, `..`
 * resolved. Undefined when it would leave the repo or is absolute.
 */
export function repoPath(...parts: (string | undefined)[]): string | undefined {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(part)) return undefined;
    for (const seg of part.split(/[\\/]/)) {
      if (!seg || seg === '.') continue;
      if (seg !== '..') out.push(seg);
      else if (!out.pop()) return undefined;
    }
  }
  return out.join('/');
}
