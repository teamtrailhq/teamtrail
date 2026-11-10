import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import SCOUT_COMMAND from '../commands/scout.md';
import { fail } from './args/help';
import type { ConnectTarget } from './connect';
import { writeIfChanged } from './files';
import { probeEndpoint, type ProbeResult } from './probeEndpoint';

type Print = (s: string) => void;
type Run = (bin: string, args: string[]) => { status: number | null; out: string; missing: boolean };

export interface ConnectRemoteOptions {
  cwd: string;
  url: string;
  /** The agent's token. Claude Code needs it now; Codex reads it from the environment each time it starts. */
  token?: string;
  print?: Print;
  /** Test seams: the client CLI and the endpoint check. */
  run?: Run;
  probe?: (url: string, token: string) => Promise<ProbeResult>;
}

const PROBE_LINE: Record<ProbeResult, string> = {
  ok: 'reachable · token accepted',
  unauthorized: 'reachable, but it refused the token. Check it in the Lookout: Settings → Remote agents',
  unreachable: "not reachable from here right now. The config is written anyway; check the URL and that it's running",
  unexpected: 'answered, but not like a Teamtrail MCP endpoint. Check the URL (it ends in /mcp)',
};

const runCli: Run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), missing };
};

function checkedUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('--url needs the MCP endpoint, e.g. http://localhost:7421/mcp');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('--url must start with http:// or https://');
  if (url.username || url.password || url.search)
    fail('--url takes no credentials or query: the token goes in a header');
  return url;
}

const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

/**
 * `teamtrail connect claude|codex --url <endpoint>`: point the agent at a Teamtrail MCP server over HTTP instead
 * of starting one over stdio. Nothing printed here ever contains the token.
 */
export async function connectRemote(target: ConnectTarget, o: ConnectRemoteOptions) {
  const print = o.print ?? ((s: string) => process.stdout.write(`${s}\n`));
  const url = checkedUrl(o.url);
  if (o.token && !o.token.startsWith('tt_')) fail('that is not a Teamtrail token (they start with tt_)');
  if (url.protocol === 'http:' && !isLocal(url.hostname))
    print(
      `  Heads up        ${url.host} is plain HTTP: the token crosses the network unencrypted. Use https for anything but a trusted network.`,
    );
  if (o.token) print(`  Endpoint        ${PROBE_LINE[await (o.probe ?? probeEndpoint)(url.href, o.token)]}`);
  if (target === 'claude') connectClaude({ ...o, url: url.href, print });
  else connectCodex({ ...o, url: url.href, print });
}

function connectClaude(o: ConnectRemoteOptions & { print: Print }) {
  if (!o.token)
    fail(
      `Claude Code keeps the token in its config, so connect needs it: --token-stdin, $${BRAND.tokenEnv} or --token`,
    );
  const file = path.join(o.cwd, '.claude', 'commands', 'scout.md');
  o.print(`  /scout command   ${writeIfChanged(file, SCOUT_COMMAND)} · ${path.relative(o.cwd, file)}`);
  const shown = `claude mcp add --transport http ${BRAND.slug} ${o.url} --header "Authorization: Bearer $${BRAND.tokenEnv}"`;
  const add = ['mcp', 'add', '--transport', 'http', BRAND.slug, o.url, '--header', `Authorization: Bearer ${o.token}`];
  const r = (o.run ?? runCli)('claude', add);
  if (r.missing)
    o.print(`  MCP server      Claude Code not found on PATH. With the token in $${BRAND.tokenEnv}, run: ${shown}`);
  else if (r.status === 0) o.print(`  MCP server      registered · ${shown}`);
  else if (/already exists/i.test(r.out))
    o.print(
      `  MCP server      "${BRAND.slug}" is already registered. To switch it to this server: claude mcp remove ${BRAND.slug}, then connect again`,
    );
  else
    o.print(`  MCP server      not registered (exit ${r.status}). With the token in $${BRAND.tokenEnv}, run: ${shown}`);
  o.print(`  Token           kept by Claude Code in its own config (~/.claude.json), for this project only`);
  o.print(`  Usage           reported by the agent itself (the transcript hook only works next to the server)`);
  o.print(`\n  In Claude Code: /scout new "<idea>", /scout resume, /scout status, /scout inbox`);
}

function connectCodex(o: ConnectRemoteOptions & { print: Print }) {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const file = path.join(home, 'prompts', 'scout.md');
  o.print(`  /scout prompt    ${writeIfChanged(file, SCOUT_COMMAND)} · ${file}`);
  const args = ['mcp', 'add', BRAND.slug, '--url', o.url, '--bearer-token-env-var', BRAND.tokenEnv];
  const r = (o.run ?? runCli)('codex', args);
  const config = path.join(home, 'config.toml');
  if (r.missing) o.print(`  MCP server      Codex not found on PATH. Add this to ${config}:`);
  else if (r.status === 0) o.print(`  MCP server      registered · codex ${args.join(' ')}`);
  else o.print(`  MCP server      not registered (exit ${r.status}). Add it to ${config} (below).`);
  o.print(
    `  Token           never written to disk: Codex reads $${BRAND.tokenEnv} when it starts, so export it in that shell`,
  );
  o.print(
    `\n  [mcp_servers.${BRAND.slug}]\n  url = ${JSON.stringify(o.url)}\n  bearer_token_env_var = "${BRAND.tokenEnv}"\n  tool_timeout_sec = 900`,
  );
  o.print(
    `\n  In Codex: /prompts:scout new "<idea>", /prompts:scout resume, /prompts:scout status, /prompts:scout inbox`,
  );
}
