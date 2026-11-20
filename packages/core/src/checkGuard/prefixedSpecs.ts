import type { CheckSpec, VerificationConfig } from '../model/verification';

/**
 * Each named check with its approved spec, its folder and `guards` moved under `prefix` (a repo whose tracker is in a
 * subfolder of the git worktree), in the order named; a name the config doesn't have is left out.
 */
export function prefixedSpecs(j: {
  config: VerificationConfig | undefined;
  checks: string[];
  prefix?: string;
}): { name: string; spec: CheckSpec }[] {
  const checks = j.config?.checks ?? {};
  return j.checks
    .filter((name) => checks[name])
    .map((name) => {
      const spec = checks[name];
      const cwd = [j.prefix, spec.cwd].filter(Boolean).join('/');
      const guards = spec.guards?.map((g) => [j.prefix, g.replace(/^\.\//, '')].filter(Boolean).join('/'));
      return { name, spec: { ...spec, ...(cwd ? { cwd } : {}), ...(guards ? { guards } : {}) } };
    });
}
