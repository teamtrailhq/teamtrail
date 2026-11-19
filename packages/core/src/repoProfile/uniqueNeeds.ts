import type { Need } from '../model/repoProfile';

/** Needs without repeats: the first of each kind and name, in order. */
export function uniqueNeeds(needs: Need[]): Need[] {
  const seen = new Set<string>();
  return needs.filter((n) => {
    const key = `${n.kind}:${n.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
