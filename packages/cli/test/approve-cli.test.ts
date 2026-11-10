import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pendingTrust } from '@teamtrail/core/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { runApprove } from '../src/approve/runApprove';

let root: string;

function io(opts: { interactive?: boolean; answers?: boolean[] } = {}) {
  const out: string[] = [];
  const answers = [...(opts.answers ?? [])];
  const asked: string[] = [];
  return {
    io: {
      out: (t: string) => void out.push(t),
      err: (t: string) => void out.push(t),
      interactive: !!opts.interactive,
      confirm: async (q: string) => (asked.push(q), answers.shift() ?? false),
    },
    text: () => out.join(''),
    asked,
  };
}

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-approve-')), '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } } }),
  );
  fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify({ v: 1, categories: { schema: 'low' } }));
});

describe('teamtrail approve', () => {
  it('refuses without a terminal unless --hash names exactly what to approve', async () => {
    const t = io();
    expect(await runApprove({ root, io: t.io, hashes: [] })).toBe(1);
    expect(t.text()).toMatch(/--hash/);
    expect(t.text()).toContain('["npm","test"]');
    expect(pendingTrust(root)).toHaveLength(2);

    const checks = pendingTrust(root).find((i) => i.kind === 'checks')!;
    expect(await runApprove({ root, io: io().io, hashes: [checks.hash] })).toBe(0);
    expect(pendingTrust(root).map((i) => i.kind)).toEqual(['policy']);
    expect(await runApprove({ root, io: io().io, hashes: ['sha256:nothing'] })).toBe(1);
  });

  it('in a terminal, shows each change and asks y/N for each', async () => {
    const t = io({ interactive: true, answers: [true, false] });
    expect(await runApprove({ root, io: t.io, hashes: [] })).toBe(0);
    expect(t.asked).toHaveLength(2);
    expect(t.text()).toContain('schema: high → low');
    expect(pendingTrust(root)).toHaveLength(1);
  });

  it('runs nothing a planted git config names (N1)', async () => {
    const top = path.dirname(root);
    const marks = path.join(top, 'marks');
    fs.mkdirSync(marks);
    const git = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: top });
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'team');
    git('config', 'core.fsmonitor', `touch ${JSON.stringify(path.join(marks, 'fsmonitor'))}; false #`);
    fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify({ v: 1, categories: { schema: 'medium' } }));
    expect(await runApprove({ root, io: io().io, hashes: [] })).toBe(1);
    expect(fs.readdirSync(marks)).toEqual([]);
  });
});
