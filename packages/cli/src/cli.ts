import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import { fail } from './args/help';
import { parseArgs, parseSubArgs } from './args/parseArgs';
import { runConnect } from './connect';
import { importKnowledge } from './knowledgeImport';
import { runMcpServer } from './mcp/server';
import { printGreeting } from './printGreeting';
import { runProjects } from './projects';
import { serveLookout } from './serve/serveLookout';
import { readStdin, recordClaudeSession } from './usage/hook';

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'mcp') {
    const o = parseSubArgs(argv.slice(1), ['--dir', '--agent', '--lease-minutes', '--no-register']);
    if (o.rest.length) fail(`unexpected argument: ${o.rest[0]}`);
    await runMcpServer({
      root: path.resolve(process.cwd(), o.dir),
      agent: o.agent,
      leaseMinutes: o.leaseMinutes,
      noRegister: o.noRegister,
      version: __VERSION__,
    });
    return;
  }
  if (argv[0] === 'hook') {
    const o = parseSubArgs(argv.slice(1), ['--dir']);
    if (o.rest[0] !== 'claude') fail('hook needs an agent: claude');
    try {
      recordClaudeSession(await readStdin(), { dir: o.dir });
    } catch {
      // a hook must never break the agent's session
    }
    return;
  }
  if (argv[0] === 'projects') {
    const o = parseSubArgs(argv.slice(1), ['--dir']);
    runProjects(o.rest, o.dir);
    process.stdout.write('\n');
    return;
  }
  if (argv[0] === 'knowledge') {
    const o = parseSubArgs(argv.slice(1), ['--dir']);
    if (o.rest[0] !== 'import' || !o.rest[1]) fail('usage: knowledge import <file.md> [--dir <path>]');
    const ids = importKnowledge(path.resolve(process.cwd(), o.dir), path.resolve(process.cwd(), o.rest[1]));
    process.stdout.write(
      `\n  ${BRAND.name} · imported ${ids.length} suggestions (${ids[0] ?? '—'}…${ids.at(-1) ?? ''}). Review them in the Lookout: Knowledge.\n\n`,
    );
    return;
  }
  const slackSetup = argv[0] === 'connect' && argv[1] === 'slack';
  if (argv[0] === 'connect' && !slackSetup) {
    const o = parseSubArgs(argv.slice(1), ['--dir', '--no-register']);
    const target = o.rest[0];
    if (target !== 'claude' && target !== 'codex') fail('connect needs an agent: claude or codex');
    printGreeting();
    process.stdout.write(`\n  ${BRAND.name} · connect ${target === 'claude' ? 'Claude Code' : 'Codex'}\n\n`);
    runConnect(target, { cwd: process.cwd(), dir: o.dir, noRegister: o.noRegister });
    process.stdout.write('\n');
    return;
  }
  await serveLookout(parseArgs(slackSetup ? argv.slice(2) : argv), slackSetup);
}

void main();
