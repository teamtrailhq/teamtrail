import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { machineKey } from '../src/machine/machineKey';

/*
 * A key that can't be read right now (permissions, too many open files, an I/O error) is never replaced: a new key
 * would make everything the old one signed read as forged. Only a missing or damaged key is (re)created.
 */

const KEY = `${'ab'.repeat(32)}\n`;

test('a key that cannot be read is not replaced: the error is thrown and the file kept', (t) => {
  if (process.getuid?.() === 0) return t.skip('root reads any file');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-key-unreadable-'));
  const file = path.join(dir, 'machine.key');
  writeFileSync(file, KEY, { mode: 0o600 });
  chmodSync(file, 0o000);
  try {
    assert.throws(() => machineKey(dir), /EACCES|EPERM/);
  } finally {
    chmodSync(file, 0o600);
  }
  assert.equal(readFileSync(file, 'utf8'), KEY);
  assert.equal(machineKey(dir), KEY.trim());
});

test('a missing key is created, a damaged one or a dangling link replaced', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-key-missing-'));
  const made = machineKey(dir);
  assert.match(made, /^[0-9a-f]{64}$/);
  writeFileSync(path.join(dir, 'machine.key'), 'not a key\n');
  assert.notEqual(machineKey(dir), made);
  const other = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-key-link-'));
  const target = path.join(other, 'nowhere');
  symlinkSync(target, path.join(other, 'machine.key'));
  assert.match(machineKey(other), /^[0-9a-f]{64}$/);
  assert.throws(() => readFileSync(target), /ENOENT/);
});
