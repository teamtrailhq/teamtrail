/**
 * A setup step name for a unit's install: its folder's last part (`web`), `deps` for the top, numbered when taken.
 * Lowercase letters, digits and dashes, as verification.json requires.
 */
export function setupStepName(dir: string, taken: string[]): string {
  const slug =
    (dir.split('/').pop() ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'deps';
  let name = slug;
  for (let n = 2; taken.includes(name); n++) name = `${slug}-${n}`;
  return name;
}
