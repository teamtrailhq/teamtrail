import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeAttentionPrefs } from '../src/attention/attentionStore';
import { writeJsonAtomic } from '../src/lib/jsonFile';
import { registerProject } from '../src/projects/registerProject';
import { credentialStore } from '../src/server/trackerConfig';

/*
 * The user config dir holds tokens (credentials.json) and what this person does (projects, Slack, attention).
 * It used to be 0755 with 0644 files whenever something other than the credential writer created it first.
 * POSIX only: Windows has no mode bits (Node maps them to the read-only flag); there the dir sits in the
 * user's profile, whose ACL already keeps other users out.
 */
const posix = process.platform !== 'win32';
const mode = (p: string) => statSync(p).mode & 0o777;

// A child process of this same file: adds `count` keys to credentials.json, each by read-modify-write.
if (process.env.CRED_WORKER) {
  const store = credentialStore(process.env.CRED_DIR!);
  for (let i = 0; i < 25; i++)
    store.update((c) => ({ ...c, linear: { apiKey: `${c.linear?.apiKey ?? ''}${process.env.CRED_WORKER}${i},` } }));
  process.exit(0);
}

test('the config dir is 0700 and every file in it 0600, whoever writes first', { skip: !posix }, () => {
  for (const first of ['projects', 'attention', 'slack-like']) {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-cfg-')), 'config');
    const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-cfg-repo-'));
    if (first === 'projects') registerProject({ configDir: dir, root: path.join(repo, '.teamtrail') });
    if (first === 'attention') writeAttentionPrefs({}, dir);
    // the Slack connector writes slack.json through writeJsonAtomic into the config dir it is given
    if (first === 'slack-like') {
      process.env.TEAMTRAIL_CONFIG_DIR = dir;
      writeJsonAtomic(path.join(dir, 'slack.json'), { v: 1 });
      delete process.env.TEAMTRAIL_CONFIG_DIR;
    }
    assert.equal(mode(dir), 0o700, `${first}: dir`);
    const file = { projects: 'projects.json', attention: 'attention.json', 'slack-like': 'slack.json' }[first]!;
    assert.equal(mode(path.join(dir, file)), 0o600, `${first}: ${file}`);
  }
});

test('looser modes left by an older version are tightened on the next write', { skip: !posix }, () => {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-cfg-')), 'config');
  mkdirSync(dir, { mode: 0o755 });
  chmodSync(dir, 0o755);
  for (const f of ['slack.json', 'projects.json', 'credentials.json']) {
    writeFileSync(path.join(dir, f), '{}');
    chmodSync(path.join(dir, f), 0o644);
  }
  writeAttentionPrefs({}, dir);
  assert.equal(mode(dir), 0o700);
  for (const f of ['slack.json', 'projects.json', 'credentials.json', 'attention.json'])
    assert.equal(mode(path.join(dir, f)), 0o600, f);
});

test('credentials.json: read-modify-write from several processes at once loses nothing', async () => {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-cfg-')), 'config');
  credentialStore(dir).update(() => ({ github: { token: 'kept' } }));
  const self = fileURLToPath(import.meta.url);
  const workers = ['a', 'b', 'c', 'd'].map(
    (w) =>
      new Promise<number | null>((resolve) =>
        fork(self, [], { env: { ...process.env, CRED_WORKER: w, CRED_DIR: dir }, stdio: 'inherit' }).on(
          'exit',
          resolve,
        ),
      ),
  );
  assert.deepEqual(await Promise.all(workers), [0, 0, 0, 0]);
  const c = JSON.parse(readFileSync(path.join(dir, 'credentials.json'), 'utf8'));
  assert.equal(c.github.token, 'kept');
  const parts = (c.linear.apiKey as string).split(',').filter(Boolean);
  assert.equal(parts.length, 100);
  if (posix) assert.equal(mode(path.join(dir, 'credentials.json')), 0o600);
});
