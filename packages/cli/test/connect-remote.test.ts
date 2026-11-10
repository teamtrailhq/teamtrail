import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubArgs } from '../src/args/parseArgs';
import { connectRemote } from '../src/connectRemote';
import { connectToken } from '../src/connectToken';
import { endpointUrl, isLoopback } from '../src/mcp/http/endpointUrl';

// The CLI build inlines the markdown file as text (build.mjs); here a stand-in is enough.
vi.mock('../commands/scout.md', () => ({ default: '# /scout' }));

const TOKEN = 'tt_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG';
let cwd: string;
let codexHome: string;
const env = { ...process.env };

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-connect-'));
  codexHome = path.join(cwd, 'codex-home');
  process.env.CODEX_HOME = codexHome;
});
afterEach(() => {
  process.env = { ...env };
  fs.rmSync(cwd, { recursive: true, force: true });
});

/** Runs connect with a fake client CLI and endpoint check; returns what was printed and what the CLI was given. */
async function connect(target: 'claude' | 'codex', o: { token?: string; status?: number; out?: string; url?: string }) {
  const printed: string[] = [];
  const calls: { bin: string; args: string[] }[] = [];
  await connectRemote(target, {
    cwd,
    url: o.url ?? 'https://trail.example.com/mcp',
    token: o.token,
    print: (s) => printed.push(s),
    run: (bin, args) => {
      calls.push({ bin, args });
      return { status: o.status ?? 0, out: o.out ?? '', missing: false };
    },
    probe: async () => 'ok',
  });
  return { text: printed.join('\n'), calls };
}

describe('connect --url', () => {
  it('registers a remote HTTP server with Claude Code, and never prints the token', async () => {
    const { text, calls } = await connect('claude', { token: TOKEN });
    expect(calls).toEqual([
      {
        bin: 'claude',
        args: [
          'mcp',
          'add',
          '--transport',
          'http',
          'teamtrail',
          'https://trail.example.com/mcp',
          '--header',
          `Authorization: Bearer ${TOKEN}`,
        ],
      },
    ]);
    expect(text).not.toContain(TOKEN);
    expect(text).toContain('Authorization: Bearer $TEAMTRAIL_TOKEN');
    expect(text).toContain('reachable · token accepted');
    expect(fs.existsSync(path.join(cwd, '.claude', 'commands', 'scout.md'))).toBe(true);
    // No transcript hook for a remote server, and nothing registered in the local projects list.
    expect(fs.existsSync(path.join(cwd, '.claude', 'settings.local.json'))).toBe(false);
  });

  it('says how to switch when the name is already taken by the stdio server', async () => {
    const { text } = await connect('claude', { token: TOKEN, status: 1, out: 'MCP server teamtrail already exists' });
    expect(text).toContain('claude mcp remove teamtrail');
    expect(text).not.toContain(TOKEN);
  });

  it('gives Codex the variable’s name, not the token', async () => {
    const { text, calls } = await connect('codex', { token: TOKEN });
    expect(calls[0]).toEqual({
      bin: 'codex',
      args: [
        'mcp',
        'add',
        'teamtrail',
        '--url',
        'https://trail.example.com/mcp',
        '--bearer-token-env-var',
        'TEAMTRAIL_TOKEN',
      ],
    });
    expect(text).not.toContain(TOKEN);
    expect(text).toContain('bearer_token_env_var = "TEAMTRAIL_TOKEN"');
    expect(text).toContain('url = "https://trail.example.com/mcp"');
    expect(fs.existsSync(path.join(codexHome, 'prompts', 'scout.md'))).toBe(true);
  });

  it('warns when the token would cross a network unencrypted, not for this machine', async () => {
    const far = await connect('codex', { url: 'http://10.0.0.5:7421/mcp' });
    expect(far.text).toMatch(/plain HTTP: the token crosses the network unencrypted/);
    const near = await connect('codex', { url: 'http://localhost:7421/mcp' });
    expect(near.text).not.toMatch(/plain HTTP/);
  });

  it('reads the token from the environment, and --token wins over it', async () => {
    process.env.TEAMTRAIL_TOKEN = TOKEN;
    expect(await connectToken({})).toBe(TOKEN);
    expect(await connectToken({ token: 'tt_other' })).toBe('tt_other');
    delete process.env.TEAMTRAIL_TOKEN;
    expect(await connectToken({})).toBeUndefined();
  });

  it('parses the flags of both subcommands', () => {
    const c = parseSubArgs(
      ['claude', '--url', 'http://h:1/mcp', '--token-stdin'],
      ['--url', '--token', '--token-stdin'],
    );
    expect(c).toMatchObject({ rest: ['claude'], url: 'http://h:1/mcp', tokenStdin: true });
    const m = parseSubArgs(
      ['--http', '--port=7500', '--host', '0.0.0.0', '--allow-host', 'a.example', '--allow-host', 'b.example'],
      ['--http', '--port', '--host', '--allow-host'],
    );
    expect(m).toMatchObject({ http: true, port: 7500, host: '0.0.0.0', allowHosts: ['a.example', 'b.example'] });
  });

  it('shows an endpoint URL a client can type', () => {
    expect(endpointUrl('127.0.0.1', 7421)).toBe('http://localhost:7421/mcp');
    expect(endpointUrl('192.168.1.5', 7421)).toBe('http://192.168.1.5:7421/mcp');
    expect(endpointUrl('::1', 7421)).toBe('http://localhost:7421/mcp');
    expect(endpointUrl('0.0.0.0', 7421)).toMatch(/^http:\/\/[\w.]+:7421\/mcp$/);
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('0.0.0.0')).toBe(false);
  });
});
