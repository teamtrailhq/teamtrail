import { pathCovered } from '../evidence/pathCovered';
import type { OutOfScopeCheck } from '../model/checkScope';
import type { VerificationConfig } from '../model/verification';
import { sharedFile } from './sharedFile';

/** A glob as people read it: `apps/web/**` is `apps/web`. */
const shownGlob = (g: string) => g.replace(/^\.\//, '').replace(/\/\*\*$/, '') || '.';

/** The reason a check didn't run, as its attempt and proof say it. */
export const outOfScopeReason = (paths: string[]) => `changes outside ${paths.map(shownGlob).join(', ')}`;

/** A file under `prefix` as the checks see it (their folders and `paths` are relative to it); undefined outside. */
function underPrefix(file: string, prefix: string): string | undefined {
  if (!prefix) return file;
  return file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : undefined;
}

export interface PathScope {
  /** The checks to run, in order. */
  run: string[];
  outOfScope: OutOfScopeCheck[];
  /** Why every check runs although some have `paths`: the first shared or unscoped file. */
  everything?: string;
}

/**
 * Which of a completion's checks its changes are about (verification.json `checks.<name>.paths`): pure. A check with
 * `paths` is left out when none of the changed files is in them. Every check runs when nothing changed (nothing to
 * tell by), when a changed file is shared (sharedFile.ts: lockfiles, the top's manifests and config, CI), or when a
 * changed file is in no check's `paths` at all (outside the tracked repo folder included): a change nobody scoped is
 * everybody's. `keep` always run (checks a criterion names as evidence, checks whose own config changed). `changed`
 * is relative to the git top; `prefix` is where the checks' folder sits under it.
 */
export function pathScope(o: {
  config: VerificationConfig | undefined;
  checks: string[];
  changed: string[];
  prefix?: string;
  keep?: string[];
}): PathScope {
  const all: PathScope = { run: o.checks, outOfScope: [] };
  const specs = o.config?.checks ?? {};
  const scoped = Object.values(specs).flatMap((s) => s.paths ?? []);
  if (!o.checks.some((n) => specs[n]?.paths?.length) || !o.changed.length) return all;
  const prefix = o.prefix ?? '';
  const unscoped = o.changed.find((f) => {
    const rel = underPrefix(f, prefix);
    return rel === undefined || sharedFile(rel) || !scoped.some((g) => pathCovered(g, rel));
  });
  if (unscoped !== undefined) return { ...all, everything: unscoped };
  const files = o.changed.map((f) => underPrefix(f, prefix) ?? f);
  const inScope = (paths: string[]) => files.some((f) => paths.some((g) => pathCovered(g, f)));
  const outOfScope: OutOfScopeCheck[] = [];
  for (const name of o.checks) {
    const s = specs[name];
    if (!s?.paths?.length || o.keep?.includes(name) || inScope(s.paths)) continue;
    outOfScope.push({ name, argv: s.run, paths: s.paths, reason: outOfScopeReason(s.paths) });
  }
  const skip = new Set(outOfScope.map((c) => c.name));
  return { run: o.checks.filter((n) => !skip.has(n)), outOfScope };
}
