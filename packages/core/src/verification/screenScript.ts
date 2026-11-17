import { readPackageJson } from './readPackageJson';
import { screenTool } from './screenTool';
import type { Found, ScreenInput } from './screenTypes';
import { scriptPlan, type PackageManager } from './scriptPlan';

const inFolder = (cwd: string) => (cwd ? ` in \`${cwd}\`` : '');

/** A script a package manager runs: is there a package.json in the check's folder, with that script? */
async function screenScriptName(i: ScreenInput, script: { name: string; strict: boolean }): Promise<Found[]> {
  const pkg = await readPackageJson(i.files, i.cwd);
  const where = inFolder(i.cwd);
  if (pkg === undefined) return [{ severity: 'wont-run', text: `No package.json${where}` }];
  if (pkg === 'invalid') return [{ severity: 'wont-run', text: `package.json${where} isn't valid JSON` }];
  if (pkg.scripts.has(script.name)) return [];
  const missing = `No \`${script.name}\` script in package.json${where}`;
  if (script.strict) return [{ severity: 'wont-run', text: missing }];
  return [{ severity: 'unsure', text: `${missing}; it runs only if \`${script.name}\` is an installed program` }];
}

/** `npm test`, `npm run lint`, `pnpm build`, `yarn test`, `npm exec vitest`: read against the package.json. */
export async function screenScript(pm: PackageManager, i: ScreenInput): Promise<Found[]> {
  const plan = scriptPlan(pm, i.args);
  switch (plan.kind) {
    case 'script':
      return screenScriptName(i, plan);
    case 'tool':
      return screenTool(i, plan.spec);
    case 'none':
      return [];
    default: {
      const never: never = plan;
      return never;
    }
  }
}
