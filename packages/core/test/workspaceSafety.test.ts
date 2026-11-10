import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseWorkspaceSettings, type WorkspaceRecord } from '../src';
import { prepareWorktree, readWorkspace, removeWorkspace } from '../src/agentHost';
import { branchChanges } from '../src/workspaces/integration';

/*
 * What a committed workspaces.json, a ticket's id and the agent-writable workspace records can make git do.
 * Before: `dir` took any path (`../../..`, absolute, a symlink out), so a teammate's push could have a claim
 * check the repo out anywhere, and record values reached git as if they were options.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-safe-')));
  dirs.push(base);
  const top = path.join(base, 'code', 'app');
  const root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'config', 'user.email', 't@t');
  sh(top, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(top, 'a.txt'), 'a\n');
  sh(top, 'add', '-A');
  sh(top, 'commit', '-qm', 'init');
  return { base, top, root };
}

const claim = (r: { top: string; root: string }, dir: string | undefined, key = '#1') =>
  prepareWorktree({
    root: r.root,
    repoRoot: r.top,
    settings: { v: 1, worktrees: true, ...(dir === undefined ? {} : { dir }) },
    mapId: 'm1',
    ticket: { id: key.replace('#', ''), key },
    agent: 'claude-01',
  });

describe('workspaces.json "dir" stays next to the repo', () => {
  it('refuses a folder outside the repo’s parent, however it is written, and creates nothing', async () => {
    const r = repo();
    const skills = path.join(r.base, 'home', '.claude', 'skills');
    fs.mkdirSync(skills, { recursive: true });
    fs.symlinkSync(skills, path.join(r.base, 'code', 'link'));
    fs.mkdirSync(path.join(r.base, 'code', '.config'));
    const outside = [
      '../..',
      '../../home/.claude/skills',
      skills,
      '../link',
      '../link/deeper',
      '../.config',
      '..\\..',
      '~/x',
      '/',
    ];
    for (const dir of outside) {
      const p = await claim(r, dir);
      expect('note' in p && p.note, dir).toMatch(/workspaces\.json.*"dir".*Work in the repo/);
    }
    expect(fs.readdirSync(skills)).toEqual([]);
    expect(fs.readdirSync(path.join(r.base, 'code', '.config'))).toEqual([]);
    expect(sh(r.top, 'worktree', 'list').split('\n').length).toBe(1);
    expect(readWorkspace(r.root, 'm1', '1')).toBeUndefined();
  });

  it('the file itself says so: an absolute "dir" is an error where the trail lead reads it', () => {
    expect(parseWorkspaceSettings('{"v":1,"worktrees":true,"dir":"/etc"}').errors[0]).toMatch(/"dir".*relative/);
    expect(parseWorkspaceSettings('{"v":1,"worktrees":true,"dir":"C:\\\\x"}').errors[0]).toMatch(/"dir".*relative/);
    expect(parseWorkspaceSettings('{"v":1,"worktrees":true,"dir":"~/x"}').errors[0]).toMatch(/"dir".*relative/);
    expect(parseWorkspaceSettings('{"v":1,"worktrees":true,"dir":"../trees"}').errors).toEqual([]);
  });

  it('the default, a sibling folder and a folder inside the repo still work', async () => {
    for (const [dir, want] of [
      [undefined, 'code/app.teamtrail/m1-1'],
      ['../trees', 'code/trees/m1-1'],
      ['../trees/deeper', 'code/trees/deeper/m1-1'],
      ['.worktrees', 'code/app/.worktrees/m1-1'],
    ] as const) {
      const r = repo();
      const p = await claim(r, dir);
      expect('workspace' in p && path.relative(r.base, p.workspace.path), String(dir)).toBe(want);
    }
  });
});

describe('workspaces.json "dir" never reaches into another project', () => {
  it('refuses the parent itself, another repo, and a folder holding anything but this repo’s worktrees', async () => {
    const r = repo();
    const code = path.join(r.base, 'code');
    // A neighbour project, and a folder of somebody's files.
    fs.mkdirSync(path.join(code, 'other-repo', 'src'), { recursive: true });
    sh(path.join(code, 'other-repo'), 'init', '-q');
    fs.mkdirSync(path.join(code, 'notes'));
    fs.writeFileSync(path.join(code, 'notes', 'todo.md'), 'mine');
    for (const dir of ['..', '../other-repo', '../other-repo/src', '../other-repo/src/new', '../notes']) {
      const p = await claim(r, dir);
      expect('note' in p && p.note, dir).toMatch(/workspaces\.json.*"dir"/);
    }
    expect(fs.readdirSync(path.join(code, 'other-repo', 'src'))).toEqual([]);
    expect(fs.readdirSync(path.join(code, 'notes'))).toEqual(['todo.md']);
  });

  it('a folder that already holds only this repo’s worktrees is reused; another repo’s worktrees are not', async () => {
    const r = repo();
    const first = await claim(r, '../trees', '#1');
    expect('workspace' in first).toBe(true);
    const second = await claim(r, '../trees', '#2');
    expect('workspace' in second && path.relative(r.base, second.workspace.path)).toBe('code/trees/m1-2');
    // Somebody else's repo puts a worktree of its own there: the folder is no longer this repo's.
    const other = path.join(r.base, 'code', 'elsewhere');
    fs.mkdirSync(other);
    sh(other, 'init', '-q', '-b', 'main');
    sh(other, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
    sh(other, 'worktree', 'add', '-q', '-b', 'w', path.join(r.base, 'code', 'trees', 'theirs'));
    const third = await claim(r, '../trees', '#3');
    expect('note' in third && third.note).toMatch(/workspaces\.json.*"dir"/);
  });
});

describe('ticket ids and records never reach git as options or paths', () => {
  it('a ticket id that is not a plain id gets no worktree: it is refused before git sees it', async () => {
    const r = repo();
    for (const key of ['#../../x', '#-b', '#1/../../2', '#a b', '#1.lock', '#..', '#', '#--upload-pack=x']) {
      const p = await claim(r, undefined, key);
      expect('note' in p && p.note, key).toMatch(/No workspace: ticket id .* can't name a branch/);
    }
    expect(sh(r.top, 'branch', '--list').split('\n').length).toBe(1);
  });

  it('a record whose base, branch or path is an option does nothing', async () => {
    const r = repo();
    const p = await claim(r, undefined);
    if (!('workspace' in p)) throw new Error(p.note);
    const record = readWorkspace(r.root, 'm1', '1') as WorkspaceRecord;
    const out = path.join(r.base, 'written-by-git');
    expect(await branchChanges({ ...record, base: `--output=${out}`, branch: 'main' })).toBeUndefined();
    expect(await branchChanges({ ...record, branch: `--output=${out}` })).toBeUndefined();
    expect(await branchChanges({ ...record, base: 'HEAD', branch: '-x' })).toBeUndefined();
    expect(fs.readdirSync(r.base).filter((n) => n.startsWith('written-by-git'))).toEqual([]);
    expect(await branchChanges(record)).toEqual([]);

    const file = path.join(r.root, '.agents', 'workspaces', 'm1--1.json');
    fs.writeFileSync(file, JSON.stringify({ ...record, path: '--force' }));
    const removed = await removeWorkspace({ root: r.root, mapId: 'm1', ticketId: '1' });
    expect(fs.existsSync(p.workspace.path)).toBe(true);
    expect(removed.kind === 'refused' && removed.reason).toMatch(/doesn't name a folder/);
  });
});
