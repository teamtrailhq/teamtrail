import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { BRAND, shellLine } from '@teamtrail/core';
import { configDir } from '@teamtrail/core/bridge';
import { autoRegister } from '@teamtrail/core/node';
import SCOUT_COMMAND from '../commands/scout.md';
import { writeIfChanged } from './files';
import { protectConfig } from './protect/protectConfig';
import type { SelfCommand } from './selfCommand';
import { installClaudeHook } from './usage/hook';

export type ConnectTarget = 'claude' | 'codex';
type Print = (s: string) => void;
export type RunCli = (bin: string, args: string[]) => { status: number | null; out: string; missing: boolean };

export interface ConnectOptions {
  cwd: string;
  dir?: string;
  noRegister?: boolean;
  /** How the agent starts this CLI again (selfCommand.ts): pinned to this version, or this local build. */
  self: SelfCommand;
  print?: Print;
  /** Test seam: the agent's own CLI. */
  run?: RunCli;
  /** Keep Teamtrail's config folder out of the agent's reach in its own settings; false is `--no-protect-config`. */
  protectConfig?: boolean;
}

const runCli = (cwd: string): RunCli => {
  return (bin, args) => {
    const r = spawnSync(bin, args, { cwd, encoding: 'utf8' });
    const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), missing };
  };
};

/** The command an agent runs to start the server; `--dir` only when the tracker folder is not the default. */
export function serverCommand(self: SelfCommand, dir?: string) {
  return [self.command, ...self.args, 'mcp', ...(dir && dir !== BRAND.dataDir ? ['--dir', dir] : [])];
}

function versionLine(self: SelfCommand, target: ConnectTarget) {
  if (!self.pinned)
    return `  Version         this local build (${shellLine([self.command, ...self.args])}), not a published version: nothing is fetched from npm. Run connect again if it moves`;
  return `  Version         pinned to ${self.pinned}: agents start exactly this version, not the newest on npm. To update, run connect again with the one you want: npx -y ${BRAND.npm}@<version> connect ${target}`;
}

/** `teamtrail connect claude|codex`: register the MCP server with the agent and install the `/scout` command. */
export function runConnect(target: ConnectTarget, opts: ConnectOptions) {
  const print = opts.print ?? ((s: string) => process.stdout.write(`${s}\n`));
  const project = autoRegister({
    configDir: configDir(),
    root: path.resolve(opts.cwd, opts.dir ?? BRAND.dataDir),
    optOut: opts.noRegister,
  });
  if (project) print(`  Project         ${project.name} · listed in the Lookout's All projects (${project.id})`);
  const o = { ...opts, print, run: opts.run ?? runCli(opts.cwd) };
  if (target === 'claude') connectClaude(o);
  else connectCodex(o);
  print(versionLine(opts.self, target));
  protectConfig(target, { print, enabled: opts.protectConfig });
  const prefix = target === 'claude' ? '/scout' : '/prompts:scout';
  const where = target === 'claude' ? 'Claude Code' : 'Codex';
  print(`\n  In ${where}: ${prefix} new "<idea>", ${prefix} resume, ${prefix} status, ${prefix} inbox`);
}

type Ready = ConnectOptions & { print: Print; run: RunCli };

/** Registers the server with Claude Code; an earlier registration (an older version) is replaced. */
function registerClaude(o: Ready, server: string[]) {
  const add = ['mcp', 'add', BRAND.slug, '--', ...server];
  const shown = `claude mcp add ${BRAND.slug} -- ${shellLine(server)}`;
  const first = o.run('claude', add);
  if (first.missing) return `Claude Code not found on PATH. Run: ${shown}`;
  if (first.status === 0) return `registered · ${shown}`;
  if (!/already exists/i.test(first.out))
    return `not registered (${first.out || `exit ${first.status}`}). Run: ${shown}`;
  o.run('claude', ['mcp', 'remove', BRAND.slug]);
  const again = o.run('claude', add);
  if (again.status === 0) return `updated · ${shown}`;
  return `not updated (${again.out || `exit ${again.status}`}). Run: claude mcp remove ${BRAND.slug}, then ${shown}`;
}

function connectClaude(o: Ready) {
  const file = path.join(o.cwd, '.claude', 'commands', 'scout.md');
  o.print(`  /scout command   ${writeIfChanged(file, SCOUT_COMMAND)} · ${path.relative(o.cwd, file)}`);
  o.print(`  MCP server      ${registerClaude(o, serverCommand(o.self, o.dir))}`);
  const settings = path.join(o.cwd, '.claude', 'settings.local.json');
  o.print(
    `  Usage hook      ${installClaudeHook(settings, o.dir, o.self)} · ${path.relative(o.cwd, settings)} (SessionStart: tokens and cost come from the session transcript)`,
  );
}

function connectCodex(o: Ready) {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const file = path.join(home, 'prompts', 'scout.md');
  o.print(`  /scout prompt    ${writeIfChanged(file, SCOUT_COMMAND)} · ${file}`);
  const [command, ...args] = serverCommand(o.self, o.dir);
  // Codex passes MCP servers only a few env vars; a custom CODEX_HOME must be forwarded for the rollout logs to be found.
  const env = process.env.CODEX_HOME ? ['--env', `CODEX_HOME=${process.env.CODEX_HOME}`] : [];
  const r = o.run('codex', ['mcp', 'add', BRAND.slug, ...env, '--', command, ...args]);
  const config = path.join(home, 'config.toml');
  if (r.missing) o.print(`  MCP server      Codex not found on PATH. Add this to ${config}:`);
  else if (r.status === 0)
    o.print(`  MCP server      registered · codex mcp add ${BRAND.slug} -- ${shellLine([command, ...args])}`);
  else o.print(`  MCP server      not registered. Add it to ${config} (below).`);
  o.print(`  Usage           read from Codex session logs in ${path.join(home, 'sessions')} (nothing to install)`);
  o.print(
    `\n  [mcp_servers.${BRAND.slug}]\n  command = ${JSON.stringify(command)}\n  args = [${args.map((a) => JSON.stringify(a)).join(', ')}]\n  tool_timeout_sec = 900` +
      (process.env.CODEX_HOME ? `\n  env = { CODEX_HOME = ${JSON.stringify(process.env.CODEX_HOME)} }` : ''),
  );
}
