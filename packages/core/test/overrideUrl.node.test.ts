import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { trackerContext } from '../src/server/trackerContext';

/** Credentials go wherever these point, so only https (or http to this machine, for the fakes) is taken. */
const apiUrlsFor = (env: Record<string, string>) =>
  trackerContext({
    root: mkdtempSync(path.join(os.tmpdir(), 'teamtrail-override-')),
    markdown: new MemoryAdapter(),
    env,
    configDir: mkdtempSync(path.join(os.tmpdir(), 'teamtrail-override-config-')),
  }).apiUrl;

test('tracker API overrides: plain http to another host, odd schemes and URLs with credentials are ignored', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const bad of [
      'http://evil.example',
      'ftp://x',
      'file:///etc/passwd',
      'https://user:pw@evil.example',
      'nope',
    ]) {
      const urls = apiUrlsFor({
        TEAMTRAIL_GITHUB_API: bad,
        TEAMTRAIL_LINEAR_API: bad,
        TEAMTRAIL_GITHUB_WEB: bad,
      });
      assert.deepEqual(urls, { github: undefined, linear: undefined, githubWeb: undefined }, bad);
    }
  } finally {
    console.warn = warn;
  }
});

test('tracker API overrides: https anywhere (GitHub Enterprise) and http to this machine (the fakes) are kept', () => {
  const urls = apiUrlsFor({
    TEAMTRAIL_GITHUB_API: 'https://ghe.example.com/api/v3',
    TEAMTRAIL_LINEAR_API: 'http://127.0.0.1:4100/graphql',
    TEAMTRAIL_GITHUB_WEB: 'http://localhost:4100',
  });
  assert.deepEqual(urls, {
    github: 'https://ghe.example.com/api/v3',
    linear: 'http://127.0.0.1:4100/graphql',
    githubWeb: 'http://localhost:4100',
  });
});
