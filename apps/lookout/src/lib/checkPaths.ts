/** Paths as typed in the checks editor (commas or spaces between them) as the list saved: [] for every change. */
export function checkPaths(typed: string): string[] {
  return [...new Set(typed.split(/[,\s]+/).filter(Boolean))];
}
