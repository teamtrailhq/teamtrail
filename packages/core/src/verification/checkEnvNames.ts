import { machineStore } from '../machine/machineStore';
import { checkEnvNameProblem } from './checkEnvNameProblem';

const FILE = 'check-env.json';
/** At most this many names: a list for a project's test settings, not an environment. */
const MAX_CHECK_ENV_NAMES = 40;

const clean = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((n): n is string => typeof n === 'string' && !checkEnvNameProblem(n)).slice(0, MAX_CHECK_ENV_NAMES)
    : [];

/**
 * The variable names this machine's person lets checks read, beyond the allowlist, for one project: names only, never
 * a value (values come from the shell that started `teamtrail`). Kept in the machine store
 * (`<config dir>/projects/<id>/check-env.json`), where nothing in the repo, no agent and no teammate's push can write,
 * read with `TEAMTRAIL_CHECK_ENV` (checkEnv.ts). Changed only by the trail lead in Settings → Verification on this
 * machine, journaled by the route.
 */
export function checkEnvNames(root: string, dir?: string) {
  const store = machineStore(root, dir);
  const names = () => clean(store.read<{ names?: unknown }>(FILE)?.names);
  const save = (next: string[]) => store.write(FILE, { v: 1, names: next, changedAt: Date.now() });
  return {
    names,
    /** Adds a name; false when it was there already. Throws on a name checkEnvNameProblem refuses or a full list. */
    add(name: string): boolean {
      const problem = checkEnvNameProblem(name);
      if (problem) throw new Error(problem);
      const now = names();
      if (now.some((n) => n.toUpperCase() === name.toUpperCase())) return false;
      if (now.length >= MAX_CHECK_ENV_NAMES) throw new Error(`at most ${MAX_CHECK_ENV_NAMES} names`);
      save([...now, name]);
      return true;
    },
    /** Removes a name; false when it wasn't there. */
    remove(name: string): boolean {
      const now = names();
      const next = now.filter((n) => n.toUpperCase() !== name.toUpperCase());
      if (next.length === now.length) return false;
      save(next);
      return true;
    },
  };
}
