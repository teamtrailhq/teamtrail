import type { RepoUnit, UnitCommand } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { toolPin } from './toolPin';
import type { UnitContext } from './types';

/** The gems a Gemfile names (`gem 'rspec-rails'`). */
const gemsOf = (text: string) => [...text.matchAll(/^\s*gem\s+['"]([\w.-]+)['"]/gm)].map((m) => m[1]);

/** rspec (a spec folder or the gem), else rake's test task; rubocop with its gem or config. Run through Bundler. */
function rubyCommands(ctx: UnitContext, gems: Set<string>): UnitCommand[] {
  const { folder } = ctx;
  const out: UnitCommand[] = [];
  const rspec = folder.dirs.has('spec') || gems.has('rspec') || gems.has('rspec-rails');
  if (rspec) out.push({ role: 'test', run: ['bundle', 'exec', 'rspec'], cwd: folder.dir, from: 'Gemfile rspec' });
  else if (folder.dirs.has('test') && folder.files.has('Rakefile'))
    out.push({ role: 'test', run: ['bundle', 'exec', 'rake', 'test'], cwd: folder.dir, from: 'Rakefile' });
  if (gems.has('rubocop') || folder.files.has('.rubocop.yml'))
    out.push({ role: 'lint', run: ['bundle', 'exec', 'rubocop'], cwd: folder.dir, from: 'rubocop' });
  return out;
}

/** A Ruby project (Gemfile): Bundler, Gemfile.lock, the Ruby pin, rspec or rake and rubocop, browser needs. */
export async function rubyUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  if (!folder.files.has('Gemfile')) return [];
  const text = (await ctx.read('Gemfile')) ?? '';
  const file = folder.dir ? `${folder.dir}/Gemfile` : 'Gemfile';
  const gems = gemsOf(text);
  const pinned = await toolPin(ctx, { name: 'ruby', files: ['.ruby-version'], aliases: ['ruby'] });
  const declared = /^\s*ruby\s+['"]([\d.]+)['"]/m.exec(text)?.[1];
  const toolchain = pinned ?? (declared ? { name: 'ruby', version: declared, from: `${file} ruby` } : undefined);
  const capybara = gems.includes('capybara') && gems.some((g) => g === 'selenium-webdriver' || g === 'cuprite');
  return [
    {
      dir: folder.dir,
      ecosystem: 'ruby',
      manager: 'bundler',
      manifest: 'Gemfile',
      ...(folder.files.has('Gemfile.lock') ? { lockfile: 'Gemfile.lock', install: ['bundle', 'install'] } : {}),
      ...(toolchain ? { toolchain } : {}),
      commands: rubyCommands(ctx, new Set(gems)),
      needs: depNeeds({ deps: capybara ? gems : gems.filter((g) => !/selenium|cuprite/.test(g)), file }),
    },
  ];
}
