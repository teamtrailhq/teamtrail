/** A repo-relative folder as a person reads it: `apps/web`, or `the top` for ''. */
export function folderLabel(dir: string): string {
  return dir || 'the top';
}
