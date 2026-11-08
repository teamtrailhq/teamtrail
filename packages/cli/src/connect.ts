import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import { configDir } from '@teamtrail/core/bridge';
import { autoRegister } from '@teamtrail/core/node';
import SCOUT_COMMAND from '../commands/scout.md';
import { writeIfChanged } from './files';
import { installClaudeHook } from './usage/hook';

export type ConnectTarget = 'claude' | 'codex';

const has = (bin: string) =>
  spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;

/** The command an agent runs to start the server; `--dir` only when the tracker folder is not the default. */
export function serverArgs(dir?: string) {
  return ['-y', BRAND.npm, 'mcp', ...(dir && dir !== BRAND.dataDir ? ['--dir', dir] : [])];
}

/** `teamtrail connect claude|codex`: register the MCP server with the agent and install the `/scout` command. */
export function runConnect(
  target: ConnectTarget,
  opts: { cwd: string; dir?: string; noRegister?: boolean; print?: (s: string) => void },
) {
  const print = opts.print ?? ((s: string) => process.stdout.write(`${s}\n`));
  const project = autoRegister({
    configDir: configDir(),
    root: path.resolve(opts.cwd, opts.dir ?? BRAND.dataDir),
    optOut: opts.noRegister,
  });
  if (project) print(`  Project         ${project.name} · listed in the Lookout's All projects (${project.id})`);
  const args = serverArgs(opts.dir);
  const quoted = ['npx', ...args].join(' ');
  if (target === 'claude') {
    const file = path.join(opts.cwd, '.claude', 'commands', 'scout.md');
    print(`  /scout command   ${writeIfChanged(file, SCOUT_COMMAND)} · ${path.relative(opts.cwd, file)}`);
    const add = ['mcp', 'add', BRAND.slug, '--', 'npx', ...args];
    if (has('claude')) {
      const r = spawnSync('claude', add, { cwd: opts.cwd, encoding: 'utf8' });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      if (r.status === 0) print(`  MCP server      registered · claude mcp add ${BRAND.slug} -- ${quoted}`);
      else if (/already exists/i.test(out)) print(`  MCP server      already registered`);
      else
        print(
          `  MCP server      not registered (${out || `exit ${r.status}`}). Run: claude mcp add ${BRAND.slug} -- ${quoted}`,
        );
    } else print(`  MCP server      Claude Code not found on PATH. Run: claude mcp add ${BRAND.slug} -- ${quoted}`);
    const settings = path.join(opts.cwd, '.claude', 'settings.local.json');
    print(
      `  Usage hook      ${installClaudeHook(settings, opts.dir)} · ${path.relative(opts.cwd, settings)} (SessionStart: tokens and cost come from the session transcript)`,
    );
    print(`\n  In Claude Code: /scout new "<idea>", /scout resume, /scout status, /scout inbox`);
    return;
  }
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const file = path.join(home, 'prompts', 'scout.md');
  print(`  /scout prompt    ${writeIfChanged(file, SCOUT_COMMAND)} · ${file}`);
  // Codex passes MCP servers only a few env vars; a custom CODEX_HOME must be forwarded for the rollout logs to be found.
  const env = process.env.CODEX_HOME ? ['--env', `CODEX_HOME=${process.env.CODEX_HOME}`] : [];
  if (has('codex')) {
    const r = spawnSync('codex', ['mcp', 'add', BRAND.slug, ...env, '--', 'npx', ...args], {
      cwd: opts.cwd,
      encoding: 'utf8',
    });
    print(
      r.status === 0
        ? `  MCP server      registered · codex mcp add ${BRAND.slug} -- ${quoted}`
        : `  MCP server      not registered. Add it to ${path.join(home, 'config.toml')} (below).`,
    );
  } else print(`  MCP server      Codex not found on PATH. Add this to ${path.join(home, 'config.toml')}:`);
  print(`  Usage           read from Codex session logs in ${path.join(home, 'sessions')} (nothing to install)`);
  print(
    `\n  [mcp_servers.${BRAND.slug}]\n  command = "npx"\n  args = [${args.map((a) => JSON.stringify(a)).join(', ')}]\n  tool_timeout_sec = 900` +
      (process.env.CODEX_HOME ? `\n  env = { CODEX_HOME = ${JSON.stringify(process.env.CODEX_HOME)} }` : ''),
  );
  print(
    `\n  In Codex: /prompts:scout new "<idea>", /prompts:scout resume, /prompts:scout status, /prompts:scout inbox`,
  );
}
