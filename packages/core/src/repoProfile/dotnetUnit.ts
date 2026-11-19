import type { RepoUnit, Toolchain, UnitCommand } from '../model/repoProfile';
import { jsonObject } from './jsonObject';
import type { UnitContext } from './types';

const SOLUTION = /\.slnx?$/;
const PROJECT = /\.(cs|fs|vb)proj$/;

/** The .NET SDK global.json pins, in the unit's folder or the top. */
async function sdkPin(ctx: UnitContext): Promise<Toolchain | undefined> {
  for (const folder of [ctx.folder, ctx.top]) {
    if (!folder.files.has('global.json')) continue;
    const path = folder.dir ? `${folder.dir}/global.json` : 'global.json';
    const sdk = jsonObject(await ctx.reader.read(path))?.sdk as Record<string, unknown> | undefined;
    if (typeof sdk?.version === 'string') return { name: 'dotnet', version: sdk.version, from: `${path} sdk.version` };
  }
  return undefined;
}

/** `dotnet test` for a solution or a test project, `dotnet build` for any other project; the file named when several. */
async function dotnetCommands(ctx: UnitContext, manifest: string, several: boolean): Promise<UnitCommand[]> {
  const target = several ? [manifest] : [];
  const cwd = ctx.folder.dir;
  if (SOLUTION.test(manifest)) return [{ role: 'test', run: ['dotnet', 'test', ...target], cwd, from: manifest }];
  const text = (await ctx.read(manifest)) ?? '';
  const tests = /Microsoft\.NET\.Test\.Sdk/.test(text);
  if (tests) return [{ role: 'test', run: ['dotnet', 'test', ...target], cwd, from: `${manifest} test SDK` }];
  return [{ role: 'build', run: ['dotnet', 'build', ...target], cwd, from: manifest }];
}

/**
 * A .NET solution (*.sln, *.slnx) or project (*.csproj, *.fsproj, *.vbproj). A project a solution lists is built
 * from the solution's folder; a project on its own is tested or built in its folder.
 */
export async function dotnetUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  const solutions = [...folder.files].filter((f) => SOLUTION.test(f)).sort();
  const projects = [...folder.files].filter((f) => PROJECT.test(f)).sort();
  const manifest = solutions[0] ?? projects[0];
  if (!manifest) return [];
  const member = solutions.length ? undefined : ctx.memberOf(['dotnet']);
  const lock = folder.files.has('packages.lock.json');
  const toolchain = await sdkPin(ctx);
  const several = solutions.length + projects.length > 1;
  return [
    {
      dir: folder.dir,
      ecosystem: 'dotnet',
      manager: 'dotnet',
      manifest,
      ...(lock ? { lockfile: 'packages.lock.json' } : {}),
      ...(member ? { memberOf: member.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(member ? {} : { install: ['dotnet', 'restore', ...(lock ? ['--locked-mode'] : [])] }),
      commands: member ? [] : await dotnetCommands(ctx, manifest, several),
      needs: [],
    },
  ];
}
