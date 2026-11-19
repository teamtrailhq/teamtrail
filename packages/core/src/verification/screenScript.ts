import { pmRoute, type PmRoute } from './pmRoute';
import { readPackageJson } from './readPackageJson';
import { repoPath } from './repoPath';
import { screenTool } from './screenTool';
import type { Found, ScreenInput } from './screenTypes';
import { scriptInstall } from './scriptInstall';
import { scriptPlan, type PackageManager, type ScriptPlan } from './scriptPlan';
import { workspaceFolder } from './workspaceFolder';

const inFolder = (cwd: string) => (cwd ? ` in \`${cwd}\`` : '');

/** A script a package manager runs: is there a package.json in the check's folder, with that script, installed? */
async function screenScriptName(
  i: ScreenInput,
  script: { name: string; strict: boolean; ifPresent: boolean },
): Promise<Found[]> {
  const pkg = await readPackageJson(i.files, i.cwd);
  const where = inFolder(i.cwd);
  if (pkg === undefined) return [{ severity: 'wont-run', text: `No package.json${where}` }];
  if (pkg === 'invalid') return [{ severity: 'wont-run', text: `package.json${where} isn't valid JSON` }];
  const line = pkg.scriptLines.get(script.name);
  if (line !== undefined) return scriptInstall({ files: i.files, cwd: i.cwd, line });
  if (pkg.scripts.has(script.name) || script.ifPresent) return [];
  const missing = `No \`${script.name}\` script in package.json${where}`;
  if (script.strict) return [{ severity: 'wont-run', text: missing }];
  return [{ severity: 'unsure', text: `${missing}; it runs only if \`${script.name}\` is an installed program` }];
}

/** `npm web:lint`: npm has no such command; a script of that name runs with `npm run`, its other words kept. */
async function screenUnknown(i: ScreenInput, name: string): Promise<Found[]> {
  const pkg = await readPackageJson(i.files, i.cwd);
  const problem = `npm has no \`${name}\` command`;
  const hasScript = !!pkg && pkg !== 'invalid' && pkg.scripts.has(name);
  if (!hasScript) return [{ severity: 'wont-run', text: problem }];
  const at = i.args.indexOf(name);
  const run = [i.program, ...i.args.slice(0, at), 'run', ...i.args.slice(at)];
  const text = `${problem}; the script runs with \`npm run ${name}\``;
  return [{ severity: 'wont-run', text, fix: { run, problem } }];
}

/** One plan read against the package in `i.cwd`. */
function screenPlan(i: ScreenInput, plan: ScriptPlan, route: PmRoute): Promise<Found[]> | Found[] {
  switch (plan.kind) {
    case 'script':
      return screenScriptName(i, { ...plan, ifPresent: route.ifPresent });
    case 'tool':
      return screenTool(i, plan.spec);
    case 'unknown':
      return screenUnknown(i, plan.name);
    case 'none':
      return [];
    default: {
      const never: never = plan;
      return never;
    }
  }
}

type Folders = { kind: 'folders'; dirs: string[] } | { kind: 'found'; found: Found[] };

/**
 * The package folders a routed command runs in: the check's own, the one `--prefix`/`-C` names, or each workspace
 * `-w`/`--filter` names that reading the repo can place. None (nothing to say) for every-workspace runs.
 */
async function routeFolders(i: ScreenInput, route: PmRoute): Promise<Folders> {
  if (route.all) return { kind: 'folders', dirs: [] };
  const base = route.dir === undefined ? i.cwd : repoPath(i.cwd, route.dir);
  if (base === undefined) return { kind: 'found', found: [] };
  if (base && (await i.files.kind(base)) !== 'dir')
    return { kind: 'found', found: [{ severity: 'wont-run', text: `No folder \`${base}\`` }] };
  if (!route.workspaces.length) return { kind: 'folders', dirs: [base] };
  const dirs = await Promise.all(route.workspaces.map((name) => workspaceFolder({ files: i.files, cwd: base, name })));
  return { kind: 'folders', dirs: dirs.filter((d): d is string => d !== undefined) };
}

/**
 * `npm test`, `npm run lint`, `pnpm build`, `yarn test`, `bun run lint`, `npm exec vitest`: read against the
 * package.json of the folder it runs in, a workspace it names included (`npm test -w web`, `pnpm --filter web lint`).
 */
export async function screenScript(pm: PackageManager, i: ScreenInput): Promise<Found[]> {
  const route = pmRoute(pm, i.args);
  const folders = await routeFolders(i, route);
  if (folders.kind === 'found') return folders.found;
  const plan = scriptPlan(pm, route.words);
  const found = await Promise.all(folders.dirs.map((cwd) => screenPlan({ ...i, cwd }, plan, route)));
  return found.flat();
}
