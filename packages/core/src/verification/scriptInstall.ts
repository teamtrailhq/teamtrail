import { commandsOf } from '../checkGuard/commandsOf';
import type { RepoFiles } from '../model/checkScreening';
import { packagesOf } from './binPackages';
import { folderChain } from './folderChain';
import { nodeInstall } from './nodeInstall';
import { readPackageJson } from './readPackageJson';
import type { Found } from './screenTypes';

/** The dependencies declared in package.json files at or above `cwd` (a workspace root's are hoisted). */
async function declared(files: RepoFiles, cwd: string): Promise<Set<string>> {
  const deps = new Set<string>();
  for (const dir of folderChain(cwd)) {
    const pkg = await readPackageJson(files, dir);
    if (pkg && pkg !== 'invalid') pkg.deps.forEach((d) => deps.add(d));
  }
  return deps;
}

/** The program a command starts, by name: `node_modules/.bin/ng` is `ng`; any other path isn't a package's. */
function binOf(argv0: string): string | undefined {
  const bin = /^(\.\/)?node_modules\/\.bin\/([\w.@-]+)$/.exec(argv0)?.[2];
  if (bin) return bin;
  return argv0.includes('/') ? undefined : argv0;
}

/**
 * Whether the programs a package.json script starts from the project's packages are installed: `ng test` needs
 * `node_modules/.bin/ng` when `@angular/cli` is a dependency. Only programs a declared dependency provides count (a
 * program on the machine's PATH is none of the repo's business), and the first one missing is the finding.
 */
export async function scriptInstall(o: { files: RepoFiles; cwd: string; line: string }): Promise<Found[]> {
  if (!o.files.seesInstalls) return [];
  const deps = await declared(o.files, o.cwd);
  for (const cmd of commandsOf(o.line)) {
    const bin = binOf(cmd[0]);
    if (!bin || !packagesOf(bin).some((p) => deps.has(p))) continue;
    const found = await nodeInstall({ files: o.files, cwd: o.cwd, bin });
    if (found.length) return found;
  }
  return [];
}
