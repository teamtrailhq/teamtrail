import type { Ecosystem, RepoUnit, UnitCommand } from '../model/repoProfile';
import type { UnitContext } from './types';

interface Simple {
  ecosystem: Ecosystem;
  manager: string;
  manifests: string[];
  lockfile: string;
  install?: string[];
  commands: { role: UnitCommand['role']; run: string[] }[];
}

/** Stacks the profile detects with their usual commands, without reading their manifests. */
const SIMPLE: Simple[] = [
  {
    ecosystem: 'swift',
    manager: 'swiftpm',
    manifests: ['Package.swift'],
    lockfile: 'Package.resolved',
    install: ['swift', 'package', 'resolve'],
    commands: [{ role: 'test', run: ['swift', 'test'] }],
  },
  {
    ecosystem: 'elixir',
    manager: 'mix',
    manifests: ['mix.exs'],
    lockfile: 'mix.lock',
    install: ['mix', 'deps.get'],
    commands: [{ role: 'test', run: ['mix', 'test'] }],
  },
  {
    ecosystem: 'deno',
    manager: 'deno',
    manifests: ['deno.json', 'deno.jsonc'],
    lockfile: 'deno.lock',
    commands: [
      { role: 'test', run: ['deno', 'test'] },
      { role: 'lint', run: ['deno', 'lint'] },
    ],
  },
];

function simpleUnit(ctx: UnitContext, s: Simple): RepoUnit | undefined {
  const manifest = s.manifests.find((m) => ctx.folder.files.has(m));
  if (!manifest) return undefined;
  const lock = ctx.folder.files.has(s.lockfile);
  return {
    dir: ctx.folder.dir,
    ecosystem: s.ecosystem,
    manager: s.manager,
    manifest,
    ...(lock ? { lockfile: s.lockfile } : {}),
    ...(s.install ? { install: s.install } : {}),
    commands: s.commands.map((c) => ({ ...c, cwd: ctx.folder.dir, from: manifest })),
    needs: [],
  };
}

/** A Dart or Flutter package (pubspec.yaml): `flutter test` when it depends on the Flutter SDK, else `dart test`. */
async function dartUnit(ctx: UnitContext): Promise<RepoUnit | undefined> {
  if (!ctx.folder.files.has('pubspec.yaml')) return undefined;
  const text = (await ctx.read('pubspec.yaml')) ?? '';
  const tool = /sdk:\s*flutter/.test(text) ? 'flutter' : 'dart';
  const lock = ctx.folder.files.has('pubspec.lock');
  return {
    dir: ctx.folder.dir,
    ecosystem: 'dart',
    manager: tool,
    manifest: 'pubspec.yaml',
    ...(lock ? { lockfile: 'pubspec.lock' } : {}),
    install: [tool, 'pub', 'get'],
    commands: [{ role: 'test', run: [tool, 'test'], cwd: ctx.folder.dir, from: 'pubspec.yaml' }],
    needs: [],
  };
}

/** Swift packages, Elixir (mix), Deno and Dart or Flutter: detected with their usual commands. */
export async function otherUnits(ctx: UnitContext): Promise<RepoUnit[]> {
  const found = SIMPLE.map((s) => simpleUnit(ctx, s));
  found.push(await dartUnit(ctx));
  return found.filter((u): u is RepoUnit => !!u);
}
