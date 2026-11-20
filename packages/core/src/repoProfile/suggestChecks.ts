import { checkArgv, checkNotice } from '../guides/checkArgv';
import type { CheckSuggestion } from '../model/checkScreening';
import type { CommandRole, RepoProfile, RepoUnit } from '../model/repoProfile';

/** The roles offered as checks, in the order they're offered within a unit. */
const ROLES: CommandRole[] = ['test', 'lint', 'typecheck', 'format', 'check', 'build'];
const MAX_SUGGESTIONS = 20;

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

/**
 * A check name from the folder's last part and the role (`web-test`, `test` at the top); a second command of the
 * same role is named by its program (`golangci-lint`), then numbered.
 */
function nameOf(o: { dir: string; role: CommandRole; run: string[]; taken: Set<string> }): string {
  const slug = slugOf(o.dir.split('/').pop() ?? '');
  const program = slugOf(o.run[0].split('/').pop() ?? '') || o.role;
  const [first, second] = [o.role, program].map((part) => (slug ? `${slug}-${part}` : part));
  let name = o.taken.has(first) ? second : first;
  for (let n = 2; o.taken.has(name); n++) name = `${second}-${n}`;
  o.taken.add(name);
  return name;
}

/** A unit's commands in role order, one per argv. */
function commandsIn(unit: RepoUnit) {
  const sorted = [...unit.commands].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  return sorted.filter((c, i) => sorted.findIndex((d) => d.run.join(' ') === c.run.join(' ')) === i);
}

/** A unit that is one part of a monorepo (a workspace member, or one of several units), below the top. */
const partOf = (profile: RepoProfile, unit: RepoUnit) => !!unit.dir && (!!unit.memberOf || profile.layout !== 'single');

/**
 * The checks the profile suggests: each unit's commands (shallowest unit first, test before lint), in the unit's
 * folder, scoped to that folder (`paths`) when the unit is one part of a monorepo. Only argv the check lint accepts (guides/checkArgv.ts): a refused shape is never offered. `known` says
 * whether it's a known check shape; saving any of them is still the person's approval. At most 20.
 */
export function suggestChecks(profile: RepoProfile): CheckSuggestion[] {
  const taken = new Set<string>();
  const out: CheckSuggestion[] = [];
  for (const unit of profile.units) {
    for (const c of commandsIn(unit)) {
      if (out.length >= MAX_SUGGESTIONS) return out;
      const spec = { run: c.run, ...(c.cwd ? { cwd: c.cwd } : {}) };
      if (checkArgv(spec).length) continue;
      const name = nameOf({ dir: c.cwd, role: c.role, run: c.run, taken });
      const known = !checkNotice(spec);
      const paths = partOf(profile, unit) ? { paths: [`${unit.dir}/**`] } : {};
      out.push({
        name,
        run: c.run,
        cwd: c.cwd,
        role: c.role,
        ecosystem: unit.ecosystem,
        from: c.from,
        known,
        ...paths,
      });
    }
  }
  return out;
}
