import type { RepoUnit } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { jsonObject } from './jsonObject';
import { nodeCommands } from './nodeCommands';
import { nodeManager } from './nodeManager';
import { toolPin } from './toolPin';
import type { FolderView, UnitContext } from './types';

const NODE_WORKSPACES = ['npm', 'pnpm', 'yarn', 'bun'] as const;

/** The frozen install from a Node lockfile: it installs exactly what the lockfile names, never resolves anew. */
function frozenInstall(manager: string, folder: FolderView): string[] {
  if (manager === 'pnpm') return ['pnpm', 'install', '--frozen-lockfile'];
  if (manager === 'bun') return ['bun', 'install', '--frozen-lockfile'];
  if (manager === 'yarn' && folder.files.has('.yarnrc.yml')) return ['yarn', 'install', '--immutable'];
  if (manager === 'yarn') return ['yarn', 'install', '--frozen-lockfile'];
  return ['npm', 'ci'];
}

const names = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v) : []);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** The Node version a package.json pins: Volta's, else `engines.node`. */
function manifestPin(pkg: Record<string, unknown>, dir: string) {
  const file = dir ? `${dir}/package.json` : 'package.json';
  const volta = str((pkg.volta as Record<string, unknown> | undefined)?.node);
  if (volta) return { name: 'node', version: volta, from: `${file} volta.node` };
  const engines = str((pkg.engines as Record<string, unknown> | undefined)?.node);
  return engines ? { name: 'node', version: engines, from: `${file} engines.node` } : undefined;
}

/** A version file in the unit's own folder, then its package.json's pin, then the top folder's version file. */
async function nodePin(ctx: UnitContext, pkg: Record<string, unknown>) {
  const dir = ctx.folder.dir;
  const pin = await toolPin(ctx, { name: 'node', files: ['.nvmrc', '.node-version'], aliases: ['node', 'nodejs'] });
  const own = pin && (!dir || pin.from.startsWith(`${dir}/`)) ? pin : undefined;
  return own ?? manifestPin(pkg, dir) ?? pin;
}

/**
 * A folder with a package.json: its package manager (its own, else its workspace's, else npm), lockfile, Node
 * version pin, scripts as commands in its own folder, and the browser or Docker its dev dependencies need.
 */
export async function nodeUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  if (!folder.files.has('package.json')) return [];
  const pkg = jsonObject(await ctx.read('package.json')) ?? {};
  const own = nodeManager(folder, pkg);
  const workspace = ctx.memberOf([...NODE_WORKSPACES]);
  const manager = own?.manager ?? workspace?.tool ?? 'npm';
  const file = folder.dir ? `${folder.dir}/package.json` : 'package.json';
  const scripts = (pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}) as Record<string, unknown>;
  const deps = [...names(pkg.dependencies), ...names(pkg.devDependencies)];
  const installRoot = !!own?.lockfile && !workspace;
  const toolchain = await nodePin(ctx, pkg);
  return [
    {
      dir: folder.dir,
      ecosystem: 'node',
      manager,
      manifest: 'package.json',
      ...(own?.lockfile ? { lockfile: own.lockfile } : {}),
      ...(workspace ? { memberOf: workspace.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(installRoot ? { install: frozenInstall(manager, folder) } : {}),
      commands: nodeCommands({ scripts, manager, dir: folder.dir }),
      needs: depNeeds({ deps, file }),
    },
  ];
}
