import type { RepoUnit, UnitCommand } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { jsonObject } from './jsonObject';
import type { UnitContext } from './types';

const keys = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v) : []);

/** PHPUnit and PHPStan from the project's own vendor/bin, when it requires them or has their config. */
function phpCommands(ctx: UnitContext, packages: Set<string>): UnitCommand[] {
  const has = (f: string) => ctx.folder.files.has(f);
  const dir = ctx.folder.dir;
  const out: UnitCommand[] = [];
  if (packages.has('phpunit/phpunit') || has('phpunit.xml') || has('phpunit.xml.dist'))
    out.push({ role: 'test', run: ['vendor/bin/phpunit'], cwd: dir, from: 'composer.json phpunit/phpunit' });
  if (packages.has('phpstan/phpstan') || has('phpstan.neon') || has('phpstan.neon.dist'))
    out.push({ role: 'lint', run: ['vendor/bin/phpstan', 'analyse'], cwd: dir, from: 'composer.json phpstan/phpstan' });
  return out;
}

/** A PHP project (composer.json): Composer, composer.lock, `require.php`, PHPUnit and PHPStan, browser needs. */
export async function phpUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  if (!folder.files.has('composer.json')) return [];
  const composer = jsonObject(await ctx.read('composer.json')) ?? {};
  const file = folder.dir ? `${folder.dir}/composer.json` : 'composer.json';
  const packages = [...keys(composer.require), ...keys(composer['require-dev'])];
  const php = (composer.require as Record<string, unknown> | undefined)?.php;
  const lock = folder.files.has('composer.lock');
  return [
    {
      dir: folder.dir,
      ecosystem: 'php',
      manager: 'composer',
      manifest: 'composer.json',
      ...(lock ? { lockfile: 'composer.lock', install: ['composer', 'install', '--no-interaction'] } : {}),
      ...(typeof php === 'string' ? { toolchain: { name: 'php', version: php, from: `${file} require.php` } } : {}),
      commands: phpCommands(ctx, new Set(packages)),
      needs: depNeeds({ deps: packages, file }),
    },
  ];
}
