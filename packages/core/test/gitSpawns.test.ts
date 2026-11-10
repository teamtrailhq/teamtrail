import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Every place the product starts git. A value that comes from a file, a ticket, a trail name or an agent must
 * never be read by git as an option: either the call's arguments are all fixed strings, or `--end-of-options`
 * stands before the first value. Adding a git call that takes a value without it fails here.
 */
const repo = path.resolve(__dirname, '../../..');
const SOURCES = ['packages/core/src', 'packages/cli/src', 'packages/connector-slack/src', 'apps/lookout/plugins'];
/** `git(cwd, [` and `gitText(cwd, [`, and git started through child_process or the bridge's `exec`. */
const CALL =
  /\b(?:git|gitText)\(\s*[^,()]+(?:\([^()]*\))?,\s*|\b(?:spawn|spawnSync|execFile|execFileSync|exec)\(\s*'git',\s*/g;
const LITERAL = /^'[^']*'$/;
/** A flag that is there or not: `...(force ? ['--force'] : [])`. */
const OPTIONAL_FLAGS = /^\.\.\.\([\w.]+ \? \[('--?[\w-]+'(, )?)+\] : \[\]\)$/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** The elements of the array literal that starts at `open`, split at top-level commas. */
function elements(text: string, open: number) {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '`' || c === '"') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c) && --depth === 0)
      return [...out, text.slice(start, i)].map((s) => s.trim()).filter(Boolean);
    else if (c === ',' && depth === 1) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return undefined;
}

function problems(text: string) {
  const found: string[] = [];
  for (const m of text.matchAll(CALL)) {
    const at = m.index + m[0].length;
    const line = text.slice(0, m.index).split('\n').length;
    if (text[at] !== '[') {
      found.push(`line ${line}: git arguments must be an array written at the call, so this test can read them`);
      continue;
    }
    const args = elements(text, at) ?? [];
    const end = args.indexOf("'--end-of-options'");
    const before = end === -1 ? args : args.slice(0, end);
    // The argument of `-b` is that option's value (a validated branch name), never an option itself.
    const values = before.filter((a, i) => !LITERAL.test(a) && !OPTIONAL_FLAGS.test(a) && before[i - 1] !== "'-b'");
    // `-- <pathspec>` built by findWorktree: git reads nothing after `--` as an option.
    const loose = values.filter((a) => a !== '...wt.pathspec');
    if (loose.length) found.push(`line ${line}: ${loose.join(', ')} before --end-of-options`);
  }
  return found;
}

describe('git is never handed a value it could read as an option', () => {
  it('the scanner sees what it should', () => {
    expect(problems("await git(top, ['diff', base]);")).toHaveLength(1);
    expect(problems("await git(top, ['diff', `${a}...${b}`]);")).toHaveLength(1);
    expect(problems("await gitText(ws.path, ['worktree', 'remove', p]);")).toHaveLength(1);
    expect(problems("execFileSync('git', ['log', ref], {});")).toHaveLength(1);
    expect(problems('await git(top, args);')).toHaveLength(1);
    expect(problems("await git(top, ['diff', '--end-of-options', base]);")).toEqual([]);
    expect(
      problems("await git(top, ['worktree', 'remove', ...(i.force ? ['--force'] : []), '--end-of-options', p]);"),
    ).toEqual([]);
    expect(problems("await git(pathOf(x), ['status', '--porcelain']);")).toEqual([]);
  });

  it('holds for every git call in the product', () => {
    // git.ts is the wrapper every call goes through; it adds its own fixed options in front.
    const all = SOURCES.flatMap((s) => files(path.join(repo, s))).filter(
      (f) => !f.endsWith(path.join('evidence', 'git.ts')),
    );
    const calls = all.filter((f) => fs.readFileSync(f, 'utf8').match(CALL));
    expect(calls.length).toBeGreaterThan(5);
    const bad = all.flatMap((f) => problems(fs.readFileSync(f, 'utf8')).map((p) => `${path.relative(repo, f)} ${p}`));
    expect(bad).toEqual([]);
  });
});
