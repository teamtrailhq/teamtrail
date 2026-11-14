import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubArgs } from '../src/args/parseArgs';
import { runConnect } from '../src/connect';
import { enableClaudeSandbox } from '../src/protect/enableClaudeSandbox';
import { sandboxChoice, type SandboxChoice } from '../src/protect/sandboxChoice';
import { selfCommand } from '../src/selfCommand';

vi.mock('../commands/scout.md', () => ({ default: '# /scout' }));

/*
 * Claude Code's deny rules keep its own file tools out of Teamtrail's config folder; its shell commands are kept out
 * only while its sandbox is on, which it isn't by default. `connect claude` offers to turn it on for the project.
 * Every path here is a temp folder: HOME, Claude Code's config, Teamtrail's and the repo.
 */
let tmp: string;
let repo: string;
const before = { ...process.env };

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-sandbox-')));
  repo = path.join(tmp, 'repo');
  process.env.HOME = path.join(tmp, 'home');
  process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'home', '.claude');
  process.env.TEAMTRAIL_CONFIG_DIR = path.join(tmp, 'home', '.config', 'teamtrail');
  fs.mkdirSync(repo, { recursive: true });
});
afterEach(() => {
  process.env = { ...before };
  fs.rmSync(tmp, { recursive: true, force: true });
});

const local = () => path.join(repo, '.claude', 'settings.local.json');
const self = selfCommand({ version: '0.33.0', file: '/Users/a/.npm/_npx/abc/node_modules/teamtrail/dist/cli.js' });

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}

function connect(o: { sandbox?: SandboxChoice; protectConfig?: boolean } = {}) {
  const lines: string[] = [];
  const run = () => ({ status: 0, out: '', missing: false });
  runConnect('claude', { cwd: repo, noRegister: true, self, print: (s) => lines.push(s), run, ...o });
  return lines.join('\n');
}

function choose(o: { flag?: boolean; interactive: boolean; answer?: string }) {
  const asked: string[] = [];
  const ask = async (q: string) => (asked.push(q), o.answer ?? '');
  return sandboxChoice({ cwd: repo, flag: o.flag, interactive: o.interactive, ask }).then((c) => ({ c, asked }));
}

describe('enableClaudeSandbox', () => {
  it('adds sandbox.enabled: true, keeping every other setting', () => {
    writeJson(local(), { hooks: { SessionStart: [] }, sandbox: { filesystem: { denyRead: ['~/.aws'] } } });
    expect(enableClaudeSandbox(local())).toBe('enabled');
    expect(JSON.parse(fs.readFileSync(local(), 'utf8'))).toEqual({
      hooks: { SessionStart: [] },
      sandbox: { filesystem: { denyRead: ['~/.aws'] }, enabled: true, autoAllowBashIfSandboxed: false },
    });
    expect(enableClaudeSandbox(local())).toBe('unchanged');
  });

  it('keeps permission prompts as they were, unless the file already chose', () => {
    writeJson(local(), { sandbox: { autoAllowBashIfSandboxed: true } });
    expect(enableClaudeSandbox(local())).toBe('enabled');
    expect(JSON.parse(fs.readFileSync(local(), 'utf8')).sandbox).toEqual({
      autoAllowBashIfSandboxed: true,
      enabled: true,
    });
  });

  it('leaves a file it can’t read, or an odd-shaped sandbox, alone', () => {
    for (const text of ['{ "model": "opus", // a comment\n}', '{"sandbox": true}', '[]']) {
      writeJson(local(), text);
      expect(enableClaudeSandbox(local())).toBe('unreadable');
      expect(fs.readFileSync(local(), 'utf8')).toBe(text);
    }
  });
});

describe('sandboxChoice', () => {
  it('asks in a terminal: Enter and y are yes, n is no', async () => {
    const yes = await choose({ interactive: true, answer: '' });
    expect(yes.c).toBe('on');
    expect(yes.asked[0]).toMatch(/Turn on Claude Code's sandbox for this project\? .* \[Y\/n\] $/);
    expect((await choose({ interactive: true, answer: 'Y' })).c).toBe('on');
    expect((await choose({ interactive: true, answer: 'n' })).c).toBe('declined');
  });

  it('the flags answer without asking; without a terminal nothing is asked', async () => {
    for (const interactive of [true, false]) {
      const on = await choose({ flag: true, interactive });
      const off = await choose({ flag: false, interactive });
      expect([on.c, off.c]).toEqual(['on', 'no-sandbox']);
      expect([...on.asked, ...off.asked]).toEqual([]);
    }
    const quiet = await choose({ interactive: false });
    expect(quiet).toEqual({ c: 'no-tty', asked: [] });
  });

  it('doesn’t ask when the project’s settings already turn it on', async () => {
    writeJson(path.join(repo, '.claude', 'settings.json'), { sandbox: { enabled: true } });
    expect(await choose({ interactive: true, answer: 'n' })).toEqual({ c: 'on', asked: [] });
  });

  it('asks when it is turned off, since the local settings win over the user’s', async () => {
    writeJson(path.join(tmp, 'home', '.claude', 'settings.json'), { sandbox: { enabled: true } });
    writeJson(local(), { sandbox: { enabled: false } });
    expect((await choose({ interactive: true, answer: 'n' })).asked).toHaveLength(1);
  });

  it('parses --sandbox and --no-sandbox', () => {
    expect(parseSubArgs(['claude', '--sandbox'], ['--sandbox', '--no-sandbox']).sandbox).toBe(true);
    expect(parseSubArgs(['claude', '--no-sandbox'], ['--sandbox', '--no-sandbox']).sandbox).toBe(false);
  });
});

describe('connect claude and the sandbox', () => {
  it('turns it on in .claude/settings.local.json, next to the usage hook, and says how to undo it', () => {
    const text = connect({ sandbox: 'on' });
    const settings = JSON.parse(fs.readFileSync(local(), 'utf8'));
    expect(settings.sandbox).toEqual({ enabled: true, autoAllowBashIfSandboxed: false });
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(text).toMatch(
      /Sandbox {9}on · \.claude\/settings\.local\.json · shell commands can't reach the config folder either/,
    );
    expect(text).toMatch(/To undo: delete "enabled" from "sandbox" in \.claude\/settings\.local\.json/);
  });

  it('says so when it is already on, and changes nothing', () => {
    connect({ sandbox: 'on' });
    const first = fs.readFileSync(local(), 'utf8');
    expect(connect({ sandbox: 'no-sandbox' })).toMatch(/Sandbox {9}already on · \.claude\/settings\.local\.json/);
    expect(fs.readFileSync(local(), 'utf8')).toBe(first);
  });

  it('never changes an explicit sandbox.enabled: false without a yes or --sandbox', () => {
    writeJson(local(), { sandbox: { enabled: false } });
    for (const sandbox of ['no-tty', 'declined', 'no-sandbox'] as const) {
      const text = connect({ sandbox });
      expect(JSON.parse(fs.readFileSync(local(), 'utf8')).sandbox).toEqual({ enabled: false });
      expect(text).toMatch(/To turn it on: connect claude --sandbox/);
    }
    connect({ sandbox: 'on' });
    expect(JSON.parse(fs.readFileSync(local(), 'utf8')).sandbox).toEqual({
      enabled: true,
      autoAllowBashIfSandboxed: false,
    });
  });

  it('without a terminal or a flag: nothing changes, and it prints how to turn it on', () => {
    const text = connect();
    expect(JSON.parse(fs.readFileSync(local(), 'utf8')).sandbox).toBeUndefined();
    expect(text).toMatch(/Sandbox {9}not changed \(no terminal to ask in\)/);
  });

  it('leaves the sandbox alone with --no-protect-config', () => {
    const text = connect({ sandbox: 'on', protectConfig: false });
    expect(JSON.parse(fs.readFileSync(local(), 'utf8')).sandbox).toBeUndefined();
    expect(text).not.toMatch(/Sandbox/);
  });
});
