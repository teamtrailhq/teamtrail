import type { RepoUnit, Toolchain, UnitCommand } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { tomlString } from './tomlGet';
import { tomlTables, type TomlValue } from './tomlLite';
import { toolPin } from './toolPin';
import type { UnitContext } from './types';

type Tables = Map<string, Map<string, TomlValue>>;

/** The Rust toolchain: rust-toolchain.toml's channel, the plain rust-toolchain file, else `rust-version`. */
async function rustPin(ctx: UnitContext, tables: Tables, file: string): Promise<Toolchain | undefined> {
  for (const folder of [ctx.folder, ctx.top]) {
    if (!folder.files.has('rust-toolchain.toml')) continue;
    const path = folder.dir ? `${folder.dir}/rust-toolchain.toml` : 'rust-toolchain.toml';
    const channel = tomlString(tomlTables((await ctx.reader.read(path)) ?? ''), 'toolchain', 'channel');
    if (channel) return { name: 'rust', version: channel, from: path };
  }
  const plain = await toolPin(ctx, { name: 'rust', files: ['rust-toolchain'], aliases: ['rust'] });
  if (plain) return plain;
  const version =
    tomlString(tables, 'package', 'rust-version') ?? tomlString(tables, 'workspace.package', 'rust-version');
  return version ? { name: 'rust', version, from: `${file} rust-version` } : undefined;
}

/** The crates a Cargo.toml depends on, normal and dev. */
const cratesOf = (tables: Tables) =>
  ['dependencies', 'dev-dependencies', 'workspace.dependencies'].flatMap((t) => [...(tables.get(t)?.keys() ?? [])]);

/** `cargo test`, clippy denying warnings and `cargo fmt --check`, locked to Cargo.lock when there is one. */
function cargoCommands(dir: string, locked: boolean): UnitCommand[] {
  const lock = locked ? ['--locked'] : [];
  return [
    { role: 'test', run: ['cargo', 'test', ...lock], cwd: dir, from: 'Cargo.toml' },
    { role: 'lint', run: ['cargo', 'clippy', ...lock, '--', '-D', 'warnings'], cwd: dir, from: 'Cargo.toml' },
    { role: 'format', run: ['cargo', 'fmt', '--check'], cwd: dir, from: 'Cargo.toml' },
  ];
}

/**
 * A Cargo package or workspace (Cargo.toml). A member of a Cargo workspace is built and tested from the workspace's
 * folder, so only the workspace (or a package on its own) gets commands and an install.
 */
export async function rustUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  if (!folder.files.has('Cargo.toml')) return [];
  const tables = tomlTables((await ctx.read('Cargo.toml')) ?? '');
  const file = folder.dir ? `${folder.dir}/Cargo.toml` : 'Cargo.toml';
  const member = ctx.memberOf(['cargo']);
  const lockfile = folder.files.has('Cargo.lock') ? 'Cargo.lock' : undefined;
  const toolchain = await rustPin(ctx, tables, file);
  return [
    {
      dir: folder.dir,
      ecosystem: 'rust',
      manager: 'cargo',
      manifest: 'Cargo.toml',
      ...(lockfile ? { lockfile } : {}),
      ...(member ? { memberOf: member.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(member ? {} : { install: ['cargo', 'fetch', ...(lockfile ? ['--locked'] : [])] }),
      commands: member ? [] : cargoCommands(folder.dir, !!lockfile),
      needs: depNeeds({ deps: cratesOf(tables), file }),
    },
  ];
}
