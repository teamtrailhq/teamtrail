import { folderChain } from './folderChain';
import { readPackageJson } from './readPackageJson';
import { repoPath } from './repoPath';
import type { Found, ScreenInput } from './screenTypes';

/** Programs whose package has another name. */
const PACKAGE_OF: Record<string, string> = {
  tsc: 'typescript',
  playwright: '@playwright/test',
  'vue-tsc': 'vue-tsc',
};

/** `pkg@1.2`, `@scope/pkg@1.2` → the package name. */
function nameOf(spec: string) {
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
  return at > 0 ? spec.slice(0, at) : spec;
}

/** Whether a package.json in the folder or a folder above lists it, or an installed bin of that name is there. */
async function installed(i: Pick<ScreenInput, 'files' | 'cwd'>, tool: string) {
  const pkg = PACKAGE_OF[tool] ?? tool;
  for (const dir of folderChain(i.cwd)) {
    const facts = await readPackageJson(i.files, dir);
    if (facts && facts !== 'invalid' && (facts.deps.has(pkg) || facts.deps.has(tool))) return true;
    const bin = repoPath(dir, 'node_modules/.bin', tool);
    if (bin && (await i.files.kind(bin))) return true;
  }
  return false;
}

/**
 * A tool run from the project's packages (`npx vitest`, `pnpm exec eslint`): is it a dependency of a package.json
 * here or above? When not, it may still be installed globally: Teamtrail can't tell.
 */
export async function screenTool(i: Pick<ScreenInput, 'files' | 'cwd'>, spec: string | undefined): Promise<Found[]> {
  if (!spec || /^[./]/.test(spec)) return [];
  const tool = nameOf(spec);
  if (await installed(i, tool)) return [];
  return [{ severity: 'unsure', text: `\`${tool}\` isn't a dependency in package.json` }];
}
