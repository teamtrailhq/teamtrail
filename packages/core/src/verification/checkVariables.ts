import { ENV_ALLOWLIST } from '../lib/envAllowlist';
import { envNamePasses } from '../lib/envNamePasses';
import type { CheckVariables, NeededVariable } from '../model/checkScreening';
import type { Need, RepoProfile } from '../model/repoProfile';
import { uniqueNeeds } from '../repoProfile/uniqueNeeds';
import { shellCheckEnvNames } from './checkEnv';

type VariableNeed = Extract<Need, { kind: 'variable' }>;

const isVariable = (n: Need): n is VariableNeed => n.kind === 'variable';

/** Whether `source` has the name set, compared without case as the environment filter does. Never its value. */
const isSet = (source: NodeJS.ProcessEnv, name: string) =>
  Object.entries(source).some(([k, v]) => v !== undefined && v !== '' && k.toUpperCase() === name.toUpperCase());

/**
 * What checks on this machine may read, by name: the allowlist, the names `TEAMTRAIL_CHECK_ENV` lists in `source` (the
 * environment of this Teamtrail), the names added in Settings (`added`), and the names the repo's profile saw its
 * tests reference, each with whether a check gets it and whether `source` has it set. Pure; no value is ever read
 * into the result.
 */
export function checkVariables(o: {
  source: NodeJS.ProcessEnv;
  added: string[];
  profile?: RepoProfile;
}): CheckVariables {
  const fromShell = shellCheckEnvNames(o.source);
  const extra = [...fromShell, ...o.added];
  const needs = o.profile ? uniqueNeeds([...o.profile.needs, ...o.profile.units.flatMap((u) => u.needs)]) : [];
  const needed: NeededVariable[] = needs.filter(isVariable).map((n) => ({
    name: n.name,
    why: n.why,
    secretShaped: n.secretShaped,
    passes: envNamePasses(n.name, extra),
    set: isSet(o.source, n.name),
  }));
  return {
    allowlist: { names: [...ENV_ALLOWLIST.names], prefixes: [...ENV_ALLOWLIST.prefixes] },
    fromShell,
    added: o.added,
    needed,
  };
}
