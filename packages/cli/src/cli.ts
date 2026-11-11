import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, setRunningVersion } from '@teamtrail/core';
import { approveCli } from './approve/approveCli';
import { fail } from './args/help';
import { parseArgs, parseSubArgs } from './args/parseArgs';
import { runConnect } from './connect';
import { connectRemote } from './connectRemote';
import { connectToken } from './connectToken';
import { guidesCli } from './guides/guidesCli';
import { importKnowledge } from './knowledgeImport';
import { mcpHttpOptions } from './mcp/http/mcpHttpOptions';
import { runMcpHttp } from './mcp/http/runMcpHttp';
import { runMcpServer } from './mcp/server';
import { printGreeting } from './printGreeting';
import { runProjects } from './projects';
import { selfCommand } from './selfCommand';
import { serveLookout } from './serve/serveLookout';
import { readStdin, recordClaudeSession } from './usage/hook';

/** `roles` is a hidden alias of `guides`, the name they had while they were built. */
const GUIDE_COMMANDS = new Set(['guides', 'roles']);
const MCP_FLAGS = [
  '--dir',
  '--agent',
  '--lease-minutes',
  '--no-register',
  '--http',
  '--host',
  '--port',
  '--allow-host',
];

/** `teamtrail mcp`: the MCP server over stdio, or over HTTP with `--http`. */
async function mcpCommand(argv: string[]) {
  const o = parseSubArgs(argv, MCP_FLAGS);
  if (o.rest.length) fail(`unexpected argument: ${o.rest[0]}`);
  const root = path.resolve(process.cwd(), o.dir);
  if (o.http) return runMcpHttp(mcpHttpOptions(o, root));
  if (o.host || o.port !== undefined || o.allowHosts.length) fail('--host, --port and --allow-host need --http');
  await runMcpServer({
    root,
    agent: o.agent,
    leaseMinutes: o.leaseMinutes,
    noRegister: o.noRegister,
    version: __VERSION__,
  });
}

/** `teamtrail connect claude|codex`: a local stdio server, or a remote one with `--url`. */
async function connectCommand(argv: string[]) {
  const o = parseSubArgs(argv, [
    '--dir',
    '--no-register',
    '--url',
    '--token',
    '--token-stdin',
    '--allow-http',
    '--no-protect-config',
  ]);
  const target = o.rest[0];
  if (target !== 'claude' && target !== 'codex') fail('connect needs an agent: claude or codex');
  if (!o.url && (o.token || o.tokenStdin)) fail('--token and --token-stdin need --url <the MCP endpoint>');
  const local = argv.filter((a) => /^--(dir|no-register)(=|$)/.test(a));
  if (o.url && local.length)
    fail(
      `${local.join(' and ')} can't go with --url: the tracker folder and the projects list are the server's, on its machine`,
    );
  printGreeting();
  process.stdout.write(`\n  ${BRAND.name} · connect ${target === 'claude' ? 'Claude Code' : 'Codex'}\n\n`);
  if (o.url)
    await connectRemote(target, {
      cwd: process.cwd(),
      url: o.url,
      token: await connectToken(o),
      allowHttp: o.allowHttp,
      protectConfig: !o.noProtectConfig,
    });
  else {
    const self = selfCommand({ version: __VERSION__, file: fileURLToPath(import.meta.url) });
    runConnect(target, {
      cwd: process.cwd(),
      dir: o.dir,
      noRegister: o.noRegister,
      self,
      protectConfig: !o.noProtectConfig,
    });
  }
  process.stdout.write('\n');
}

async function main() {
  // Said next to what this process hands another one (answers, session docs, the lock): versions can be compared.
  setRunningVersion(__VERSION__);
  const argv = process.argv.slice(2);
  if (argv[0] === 'mcp') return mcpCommand(argv.slice(1));
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
  if (GUIDE_COMMANDS.has(argv[0])) return guidesCli(argv.slice(1));
  if (argv[0] === 'approve') return approveCli(argv.slice(1));
  const slackSetup = argv[0] === 'connect' && argv[1] === 'slack';
  if (argv[0] === 'connect' && !slackSetup) return connectCommand(argv.slice(1));
  await serveLookout(parseArgs(slackSetup ? argv.slice(2) : argv), slackSetup);
}

void main();
