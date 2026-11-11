import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubArgs } from '../src/args/parseArgs';
import { runConnect } from '../src/connect';
import { connectRemote } from '../src/connectRemote';
import { selfCommand } from '../src/selfCommand';

vi.mock('../commands/scout.md', () => ({ default: '# /scout' }));

/*
 * Agents can usually read the user's home, where Teamtrail keeps this machine's key (it signs the human's answers),
 * the approvals and tracker credentials. `connect` asks the agent's own settings to keep its tools out of that
 * folder. Every path here is a temp folder: HOME, Claude Code's and Codex's config, and Teamtrail's.
 */
let tmp: string;
let claudeDir: string;
let config: string;
const before = { ...process.env };

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-protect-')));
  claudeDir = path.join(tmp, 'home', '.claude');
  config = path.join(tmp, 'home', '.config', 'teamtrail');
  process.env.HOME = path.join(tmp, 'home');
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  process.env.CODEX_HOME = path.join(tmp, 'home', '.codex');
  process.env.TEAMTRAIL_CONFIG_DIR = config;
  fs.mkdirSync(path.join(tmp, 'repo'), { recursive: true });
});
afterEach(() => {
  process.env = { ...before };
  fs.rmSync(tmp, { recursive: true, force: true });
});

const self = selfCommand({ version: '0.25.0', file: '/Users/a/.npm/_npx/abc/node_modules/teamtrail/dist/cli.js' });
const ok = () => ({ status: 0, out: '', missing: false });

function connect(target: 'claude' | 'codex', o: { protectConfig?: boolean } = {}) {
  const lines: string[] = [];
  runConnect(target, {
    cwd: path.join(tmp, 'repo'),
    noRegister: true,
    self,
    print: (s) => lines.push(s),
    run: ok,
    ...o,
  });
  return lines.join('\n');
}

const settingsFile = () => path.join(claudeDir, 'settings.json');
const settings = () => JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
const READ = () => `Read(/${config}/**)`;
const EDIT = () => `Edit(/${config}/**)`;

describe('connect claude keeps Teamtrail’s config folder out of Claude Code’s reach', () => {
  it('adds deny rules to the user settings, keeping everything already there', () => {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({
        model: 'opus',
        permissions: { allow: ['Bash(ls)'], deny: ['Read(./.env)'] },
        sandbox: { enabled: true, filesystem: { denyRead: ['~/.aws'] } },
      }),
    );
    const text = connect('claude');
    expect(settings()).toEqual({
      model: 'opus',
      permissions: { allow: ['Bash(ls)'], deny: ['Read(./.env)', READ(), EDIT()] },
      sandbox: { enabled: true, filesystem: { denyRead: ['~/.aws', config], denyWrite: [config] } },
    });
    // It says exactly what it added, where, and how to take it out again.
    expect(text).toContain(settingsFile());
    for (const rule of [READ(), EDIT()]) expect(text).toContain(rule);
    expect(text).toMatch(/sandbox\.filesystem\.denyRead/);
    expect(text).toMatch(/sandbox\.filesystem\.denyWrite/);
    expect(text).toMatch(/To remove/);
    expect(text).toMatch(/--no-protect-config/);
  });

  it('creates the settings file when there is none', () => {
    connect('claude');
    expect(settings().permissions.deny).toEqual([READ(), EDIT()]);
  });

  it('is idempotent: a second connect changes nothing and says so', () => {
    connect('claude');
    const first = fs.readFileSync(settingsFile(), 'utf8');
    const text = connect('claude');
    expect(fs.readFileSync(settingsFile(), 'utf8')).toBe(first);
    expect(text).toMatch(/Config folder\s+already protected/);
  });

  it('--no-protect-config leaves the agent’s settings alone', () => {
    expect(parseSubArgs(['claude', '--no-protect-config'], ['--no-protect-config']).noProtectConfig).toBe(true);
    const text = connect('claude', { protectConfig: false });
    expect(fs.existsSync(settingsFile())).toBe(false);
    expect(text).toMatch(/Config folder\s+not protected \(--no-protect-config\)/);
  });

  it('never rewrites a settings file it can’t read: it prints the rules to add by hand', () => {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(settingsFile(), '{ "model": "opus", // a comment\n}');
    const text = connect('claude');
    expect(fs.readFileSync(settingsFile(), 'utf8')).toBe('{ "model": "opus", // a comment\n}');
    expect(text).toMatch(/not changed/);
    expect(text).toContain(READ());
  });

  it('names both spellings of a config folder reached through a symlink', () => {
    const real = path.join(tmp, 'real-config');
    fs.mkdirSync(real);
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.symlinkSync(real, config);
    connect('claude');
    expect(settings().permissions.deny).toEqual([READ(), EDIT(), `Read(/${real}/**)`, `Edit(/${real}/**)`]);
  });

  it('connect --url protects it too', async () => {
    const lines: string[] = [];
    await connectRemote('claude', {
      cwd: path.join(tmp, 'repo'),
      url: 'https://trail.example.com/mcp',
      token: 'tt_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
      print: (s) => lines.push(s),
      run: ok,
      probe: async () => 'ok',
    });
    expect(settings().permissions.deny).toEqual([READ(), EDIT()]);
  });
});

describe('connect codex', () => {
  it('prints the permissions profile that denies the folder, and what stays readable, without editing config.toml', () => {
    const text = connect('codex');
    expect(fs.existsSync(path.join(tmp, 'home', '.codex', 'config.toml'))).toBe(false);
    expect(text).toContain(`"${config}" = "deny"`);
    expect(text).toMatch(/default_permissions = "teamtrail"/);
    expect(text).toMatch(/extends = ":workspace"/);
    expect(text).toMatch(/readable/);
  });

  it('--no-protect-config prints nothing about it', () => {
    const text = connect('codex', { protectConfig: false });
    expect(text).not.toContain('"deny"');
    expect(text).toMatch(/Config folder\s+not protected \(--no-protect-config\)/);
  });
});
