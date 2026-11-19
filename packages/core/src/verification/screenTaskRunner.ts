import { folderChain } from './folderChain';
import { nearestFile } from './nearestFile';
import { nodeInstall } from './nodeInstall';
import { readPackageJson } from './readPackageJson';
import { screenProjectFile } from './screenStacks';
import type { Found, ScreenInput } from './screenTypes';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The tasks `turbo run a b` (or `turbo a b`) names, without a package's `web#test` form. */
function turboTasks(args: string[]): string[] {
  const words = args.filter(
    (a, n) => !a.startsWith('-') && !/^(--filter|-F|--cache-dir|--concurrency)$/.test(args[n - 1] ?? ''),
  );
  const tasks = words[0] === 'run' ? words.slice(1) : words;
  return tasks.filter((t) => !t.includes('#'));
}

/** The task names a turbo.json defines (`tasks`, or Turborepo 1's `pipeline`), `web#test` read as `test`. */
async function turboDefines(i: Pick<ScreenInput, 'files' | 'cwd'>, file: string): Promise<Set<string> | undefined> {
  const text = await i.files.read(file);
  try {
    const raw: unknown = JSON.parse(text ?? '');
    const tasks = isObj(raw) ? (raw.tasks ?? raw.pipeline) : undefined;
    return new Set(Object.keys(isObj(tasks) ? tasks : {}).map((k) => k.split('#').pop() ?? k));
  } catch {
    return undefined;
  }
}

/** Whether a package.json at or above the folder has the program as a dependency (so it comes from node_modules). */
async function fromPackages(i: Pick<ScreenInput, 'files' | 'cwd'>, pkg: string) {
  for (const dir of folderChain(i.cwd)) {
    const facts = await readPackageJson(i.files, dir);
    if (facts && facts !== 'invalid' && facts.deps.has(pkg)) return true;
  }
  return false;
}

/** `turbo run test`: a turbo.json at or above, defining the task; turbo installed when it's a dependency. */
async function screenTurbo(i: ScreenInput): Promise<Found[]> {
  const file = await nearestFile({ ...i, names: ['turbo.json', 'turbo.jsonc'] });
  if (!file) return (await screenProjectFile('turbo', i)) ?? [];
  const defined = await turboDefines(i, file);
  const missing = turboTasks(i.args).filter((t) => defined && !defined.has(t));
  if (missing.length)
    return [{ severity: 'unsure', text: `No \`${missing[0]}\` task in ${file}; a package's turbo.json may add it` }];
  return (await fromPackages(i, 'turbo')) ? nodeInstall({ files: i.files, cwd: i.cwd, bin: 'turbo' }) : [];
}

/** `nx test web`, `nx run web:test`: an Nx workspace (nx.json, or `nx` in package.json) at or above; nx installed. */
async function screenNx(i: ScreenInput): Promise<Found[]> {
  const declared = await fromPackages(i, 'nx');
  const workspace = await nearestFile({ ...i, names: ['nx.json'] });
  if (!workspace && !declared)
    return [{ severity: 'unsure', text: 'No nx.json here or above: is this an Nx workspace?' }];
  return declared ? nodeInstall({ files: i.files, cwd: i.cwd, bin: 'nx' }) : [];
}

/** Task runners over a JavaScript workspace: `turbo` and `nx`. */
export function screenTaskRunner(program: 'turbo' | 'nx', i: ScreenInput): Promise<Found[]> {
  return program === 'turbo' ? screenTurbo(i) : screenNx(i);
}
