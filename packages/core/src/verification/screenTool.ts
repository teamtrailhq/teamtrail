import { packagesOf } from './binPackages';
import { folderChain } from './folderChain';
import { nodeInstall } from './nodeInstall';
import { readPackageJson } from './readPackageJson';
import { repoPath } from './repoPath';
import type { Found, ScreenInput } from './screenTypes';

/** `pkg@1.2`, `@scope/pkg@1.2` → the package name. */
function nameOf(spec: string) {
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
  return at > 0 ? spec.slice(0, at) : spec;
}

/** What the package.json files and node_modules at or above the folder say of a tool. */
async function lookup(i: Pick<ScreenInput, 'files' | 'cwd'>, tool: string) {
  const pkgs = [...packagesOf(tool), tool];
  let declared = false;
  for (const dir of folderChain(i.cwd)) {
    const facts = await readPackageJson(i.files, dir);
    if (facts && facts !== 'invalid' && pkgs.some((p) => facts.deps.has(p))) declared = true;
    const bin = repoPath(dir, 'node_modules/.bin', tool);
    if (bin && (await i.files.kind(bin))) return { declared, bin: true };
  }
  return { declared, bin: false };
}

/**
 * A tool run from the project's packages (`npx vitest`, `pnpm exec eslint`): is it a dependency of a package.json
 * here or above, and installed? Not a dependency: it may still be installed globally, Teamtrail can't tell. A
 * dependency that isn't installed where the files show installs: it won't run until the dependencies are.
 */
export async function screenTool(i: Pick<ScreenInput, 'files' | 'cwd'>, spec: string | undefined): Promise<Found[]> {
  if (!spec || /^[./]/.test(spec)) return [];
  const tool = nameOf(spec);
  const { declared, bin } = await lookup(i, tool);
  if (bin) return [];
  if (declared) return nodeInstall({ files: i.files, cwd: i.cwd, bin: tool });
  return [{ severity: 'unsure', text: `\`${tool}\` isn't a dependency in package.json` }];
}
