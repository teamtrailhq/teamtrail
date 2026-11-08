import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import { configDir } from '@teamtrail/core/bridge';
import {
  ProjectPathError,
  projectState,
  readProjects,
  registerProject,
  trackerRootFor,
  unregisterProject,
} from '@teamtrail/core/node';
import { fail } from './args/help';

type Print = (line: string) => void;

function add(target: string | undefined, dir: string, print: Print) {
  const where = path.resolve(process.cwd(), target ?? '.');
  try {
    const custom = target === undefined && dir !== BRAND.dataDir ? path.resolve(process.cwd(), dir) : undefined;
    const root = trackerRootFor(custom ?? where, { create: true });
    const { entry, added } = registerProject({ configDir: configDir(), root });
    print(`  ${added ? 'Added' : 'Already registered'}  ${entry.name}  ${entry.id}  ${entry.root}`);
  } catch (e) {
    if (e instanceof ProjectPathError) fail(e.message);
    throw e;
  }
}

function list(print: Print) {
  const { projects, autoRegister } = readProjects(configDir());
  if (!projects.length) print(`  No projects registered. Add one: ${BRAND.slug} projects add [path]`);
  for (const p of projects) {
    const state = projectState(p.root);
    const shown = state.kind === 'ok' ? '' : `  (${state.kind === 'missing' ? 'missing' : `served at ${state.url}`})`;
    print(`  ${p.id}  ${p.name.padEnd(20)} ${p.path}${shown}`);
  }
  print(`\n  Auto-register from mcp and connect: ${autoRegister ? 'on' : 'off'}`);
}

function remove(target: string | undefined, print: Print) {
  if (!target) fail('usage: projects remove <id|path>');
  const gone = unregisterProject({ configDir: configDir(), idOrPath: target });
  if (!gone) fail(`no registered project matches ${target}`);
  print(`  Removed  ${gone.name}  ${gone.id}  (its files are untouched)`);
}

/** `teamtrail projects add|list|remove`: the machine-local registry the Lookout's "All projects" view reads. */
export function runProjects(rest: string[], dir: string, print: Print = (s) => process.stdout.write(`${s}\n`)) {
  const [cmd, target] = rest;
  print(`\n  ${BRAND.name} · projects  (${path.join(configDir(), 'projects.json')})\n`);
  switch (cmd) {
    case 'add':
      return add(target, dir, print);
    case undefined:
    case 'list':
      return list(print);
    case 'remove':
    case 'rm':
      return remove(target, print);
    default:
      fail(`unknown projects command: ${cmd} (add, list or remove)`);
  }
}
