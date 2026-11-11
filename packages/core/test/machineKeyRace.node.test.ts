import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { machineKey } from '../src/machine/machineKey';

/*
 * Several Teamtrail processes starting at once on a new machine all end up with one key. With one key each, what
 * the first signed (a trail's record, signedState/) read as forged to the others, and was set aside.
 */

if (process.env.MACHINE_KEY_WORKER) {
  process.stdout.write(machineKey(process.env.MACHINE_KEY_WORKER));
  process.exit(0);
}

test('processes creating the machine key at once all get the same one', async () => {
  for (let round = 0; round < 5; round++) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-key-race-'));
    const self = fileURLToPath(import.meta.url);
    const run = () =>
      new Promise<string>((resolve) => {
        const child = spawn(process.execPath, [self], { env: { ...process.env, MACHINE_KEY_WORKER: dir } });
        let out = '';
        child.stdout.on('data', (d) => (out += String(d)));
        child.on('exit', () => resolve(out));
      });
    const keys = await Promise.all(Array.from({ length: 6 }, run));
    assert.equal(new Set(keys).size, 1, keys.join(' '));
    assert.equal(machineKey(dir), keys[0]);
  }
});
