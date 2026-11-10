import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { npxCommand, packageSpec, shellQuote } from '@teamtrail/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runConnect } from '../src/connect';
import { selfCommand } from '../src/selfCommand';
import { hookCommand, installClaudeHook } from '../src/usage/hook';

vi.mock('../commands/scout.md', () => ({ default: '# /scout' }));

/*
 * `connect` used to register `npx -y teamtrail mcp`: every agent session then ran whatever was newest on npm.
 * It now registers the exact version of the CLI that ran it, for Claude Code, Codex and the usage hook.
 */
let cwd: string;
const before = { ...process.env };
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-connect-local-'));
  process.env.CODEX_HOME = path.join(cwd, 'codex-home');
  process.env.TEAMTRAIL_CONFIG_DIR = path.join(cwd, 'config');
});
afterEach(() => {
  process.env = { ...before };
  fs.rmSync(cwd, { recursive: true, force: true });
});

const npm = selfCommand({ version: '0.25.0', file: '/Users/a/.npm/_npx/abc/node_modules/teamtrail/dist/cli.js' });
const local = selfCommand({ version: '0.25.0', file: '/Users/a/Code/teamtrail/packages/cli/dist/cli.js' });

function connect(target: 'claude' | 'codex', o: { self?: typeof npm; dir?: string; exists?: boolean } = {}) {
  const lines: string[] = [];
  const calls: string[][] = [];
  let registered = o.exists ?? false;
  runConnect(target, {
    cwd,
    dir: o.dir,
    noRegister: true,
    self: o.self ?? npm,
    print: (s) => lines.push(s),
    run(bin, args) {
      calls.push([bin, ...args]);
      if (args[1] === 'remove') registered = false;
      else if (registered)
        return { status: 1, out: `MCP server teamtrail already exists in local config`, missing: false };
      else registered = true;
      return { status: 0, out: '', missing: false };
    },
  });
  return { text: lines.join('\n'), calls };
}

describe('connect pins the version it registers', () => {
  it('Claude Code: the MCP server and the usage hook both name the exact version', () => {
    const { text, calls } = connect('claude');
    expect(calls).toEqual([['claude', 'mcp', 'add', 'teamtrail', '--', 'npx', '-y', 'teamtrail@0.25.0', 'mcp']]);
    const settings = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'settings.local.json'), 'utf8'));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('npx -y teamtrail@0.25.0 hook claude');
    expect(text).toMatch(/Version\s+pinned to teamtrail@0\.25\.0/);
    expect(text).toMatch(/To update.*connect claude/);
    expect(text).not.toMatch(/npx -y teamtrail (mcp|hook)/);
  });

  it('Codex: the command, the printed config and --dir carry it too', () => {
    const { text, calls } = connect('codex', { dir: 'plans' });
    expect(calls[0].slice(-7)).toEqual(['--', 'npx', '-y', 'teamtrail@0.25.0', 'mcp', '--dir', 'plans']);
    expect(text).toContain('args = ["-y", "teamtrail@0.25.0", "mcp", "--dir", "plans"]');
    expect(text).toMatch(/pinned to teamtrail@0\.25\.0/);
  });

  it('running connect again replaces an older registration with this version', () => {
    const { text, calls } = connect('claude', { exists: true });
    expect(calls.map((c) => c.slice(0, 3).join(' '))).toEqual([
      'claude mcp add',
      'claude mcp remove',
      'claude mcp add',
    ]);
    expect(calls[2]).toContain('teamtrail@0.25.0');
    expect(text).toMatch(/MCP server\s+updated/);
  });

  it('a local build registers itself by path: nothing is fetched from npm', () => {
    const { text, calls } = connect('claude', { self: local });
    expect(calls[0].slice(4)).toEqual(['--', 'node', '/Users/a/Code/teamtrail/packages/cli/dist/cli.js', 'mcp']);
    expect(text).toMatch(/Version\s+this local build/);
    const file = path.join(cwd, '.claude', 'settings.local.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.SessionStart[0].hooks[0].command).toBe(
      'node /Users/a/Code/teamtrail/packages/cli/dist/cli.js hook claude',
    );
    // and connecting from npm afterwards replaces that hook rather than adding a second one
    installClaudeHook(file, undefined, npm);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.SessionStart).toHaveLength(1);
  });

  it('what counts as a version: releases and pre-releases, never a tag or anything a shell would read', () => {
    expect(packageSpec('0.25.0')).toBe('teamtrail@0.25.0');
    expect(packageSpec('0.25.1-next.33')).toBe('teamtrail@0.25.1-next.33');
    for (const v of [undefined, '', 'dev', 'latest', '1.0', '1.0.0; rm -rf ~', '1.0.0 x'])
      expect(packageSpec(v)).toBe('teamtrail');
    expect(npxCommand('0.25.0', ['connect', 'claude', '--url', 'http://h/mcp'])).toBe(
      'npx -y teamtrail@0.25.0 connect claude --url http://h/mcp',
    );
  });
});

describe('the hook command is quoted for a shell', () => {
  it('--dir with spaces, quotes or shell syntax is one argument, not a command', () => {
    expect(hookCommand('plans', npm)).toBe('npx -y teamtrail@0.25.0 hook claude --dir plans');
    expect(hookCommand('my plans', npm)).toBe("npx -y teamtrail@0.25.0 hook claude --dir 'my plans'");
    // JSON quoting left these live inside double quotes: $(…) and backticks ran.
    expect(hookCommand('$(touch pwned)', npm)).toBe("npx -y teamtrail@0.25.0 hook claude --dir '$(touch pwned)'");
    expect(hookCommand('a`id`b', npm)).toContain("'a`id`b'");
    expect(hookCommand("it's", npm)).toBe("npx -y teamtrail@0.25.0 hook claude --dir 'it'\\''s'");
    expect(shellQuote('')).toBe("''");
    expect(shellQuote('a;b|c&d>e')).toBe("'a;b|c&d>e'");
  });
});
