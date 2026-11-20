/** Whether repo-relative folder `cwd` is `dir` or inside it ('' is the top, which holds everything). */
export function insideFolder(cwd: string, dir: string): boolean {
  return !dir || cwd === dir || cwd.startsWith(`${dir}/`);
}
