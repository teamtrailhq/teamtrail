/** A workspace member pattern (`packages/*`, `apps/**`, `crates/core`) as a regular expression over folder paths. */
function patternOf(glob: string): RegExp {
  const clean = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  const body = clean
    .split('/')
    .map((part) => {
      if (part === '**') return '.*';
      return part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
    })
    .join('/');
  return new RegExp(`^${body}$`);
}

/**
 * Whether `dir` is one of a workspace's members: `patterns` are relative to `root` (`!` patterns exclude), as npm,
 * pnpm, Cargo, uv and go.work write them.
 */
export function matchesMembers(o: { root: string; patterns: string[]; dir: string }): boolean {
  const prefix = o.root ? `${o.root}/` : '';
  if (o.dir === o.root || !o.dir.startsWith(prefix)) return false;
  const rel = o.dir.slice(prefix.length);
  const included = o.patterns.filter((p) => !p.startsWith('!')).some((p) => patternOf(p).test(rel));
  const excluded = o.patterns.filter((p) => p.startsWith('!')).some((p) => patternOf(p.slice(1)).test(rel));
  return included && !excluded;
}
