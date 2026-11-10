import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { withFileLock } from '../src/lib/fileLock';

/*
 * The review: a stale lock was taken over by deleting it, so a process could delete a lock another had just
 * created. A lock is now taken over by renaming it away (atomic: one process wins), and a process only ever
 * deletes a lock file it renamed itself and that is the stale one, or its own.
 */
const dir = () => mkdtempSync(path.join(os.tmpdir(), 'teamtrail-lock-'));

test('a stale lock is taken over; a live one is waited for', () => {
  const file = path.join(dir(), 'credentials.json');
  writeFileSync(`${file}.lock`, 'someone-gone');
  const old = new Date(Date.now() - 60_000);
  utimesSync(`${file}.lock`, old, old);
  assert.equal(
    withFileLock(file, () => 'ran'),
    'ran',
  );
  assert.equal(existsSync(`${file}.lock`), false);
  assert.deepEqual(readdirSync(path.dirname(file)), []);
});

test('releasing never deletes a lock that is no longer ours', () => {
  const file = path.join(dir(), 'credentials.json');
  withFileLock(file, () => {
    // Another process took the lock over meanwhile (we were thought dead): its lock must survive our release.
    writeFileSync(`${file}.lock`, 'another-holder');
  });
  assert.equal(readFileSync(`${file}.lock`, 'utf8'), 'another-holder');
  assert.deepEqual(readdirSync(path.dirname(file)).sort(), ['credentials.json.lock']);
});
