import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { AGENTS_DIR } from '../src/agents/agentLink';
import { claimTrailName, TRAIL_NAMES_DIR } from '../src/agents/trailNameClaim';
import { tempFolder } from './tempFolder';

// Child mode: this same bundled file, re-run with CLAIM_ROOT, claims one trail name and prints it.
if (process.env.CLAIM_ROOT) {
  // Line the children up so they all try in the same instant.
  const at = Number(process.env.CLAIM_AT);
  while (Date.now() < at) {
    /* spin */
  }
  process.stdout.write(claimTrailName(process.env.CLAIM_ROOT, 'claude'));
  setTimeout(() => process.exit(0), 300);
} else {
  const claimIn = (root: string, at: number) =>
    new Promise<string>((resolve, reject) => {
      const p = spawn(process.execPath, [process.argv[1]], {
        env: { ...process.env, CLAIM_ROOT: root, CLAIM_AT: String(at) },
      });
      let out = '';
      p.stdout.on('data', (c) => (out += c));
      p.on('exit', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`child exited ${code}`))));
    });

  test('agents connecting in the same instant get different trailNames', async () => {
    const root = tempFolder('trailName-');
    const at = Date.now() + 600;
    const names = await Promise.all(Array.from({ length: 6 }, () => claimIn(root, at)));
    assert.equal(new Set(names).size, names.length, `duplicates in ${names.join(', ')}`);
    assert.deepEqual([...names].sort(), ['claude-01', 'claude-02', 'claude-03', 'claude-04', 'claude-05', 'claude-06']);
  });

  test('a trailName is freed when its process exits, and a stale lock is taken over', async () => {
    const root = tempFolder('trailName-');
    assert.equal(await claimIn(root, 0), 'claude-01');
    assert.equal(existsSync(path.join(root, AGENTS_DIR, TRAIL_NAMES_DIR, 'claude-01.json')), false);
    // A lock left by a crashed process (pid that no longer runs) does not block the name.
    mkdirSync(path.join(root, AGENTS_DIR, TRAIL_NAMES_DIR), { recursive: true });
    writeFileSync(path.join(root, AGENTS_DIR, TRAIL_NAMES_DIR, 'claude-01.json'), JSON.stringify({ pid: 999_999_9 }));
    assert.equal(await claimIn(root, 0), 'claude-01');
  });

  test('names in use elsewhere are skipped', () => {
    const root = tempFolder('trailName-');
    assert.equal(claimTrailName(root, 'codex', new Set(['codex-01'])), 'codex-02');
  });
}
