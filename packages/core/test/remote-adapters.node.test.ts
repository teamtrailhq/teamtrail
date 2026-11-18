// A process that keeps running (an MCP server, an open Lookout tab) follows the tracker Settings name now: another
// repo or token gets a new adapter, and event streams move to it instead of staying on a disposed one.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { remoteAdapters } from '../src/server/remoteAdapters';
import { trackerContext } from '../src/server/trackerContext';
import { streamTrackerEvents } from '../src/server/trackerEvents';
import { fakeGitHub } from './fakes/github';

function setup() {
  const fake = fakeGitHub();
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-remotes-')), '.teamtrail');
  const ctx = trackerContext({
    root,
    markdown: new MemoryAdapter(),
    env: { GITHUB_TOKEN: 'tok-a', TEAMTRAIL_NO_GH_CLI: '1' },
    fetch: fake.fetch,
    configDir: path.join(root, '..', 'config'),
  });
  const choose = (repo: string) => {
    const cfg = { active: 'github' as const, github: { repo } };
    ctx.project.write(cfg);
    ctx.pin.approve(cfg);
  };
  choose('octo-org/launchpad');
  return { ctx, choose, remotes: remoteAdapters(ctx) };
}

test('another repo in Settings gives running processes a new adapter, the old one stops', async () => {
  const { choose, remotes } = setup();
  const first = await remotes.get('github');
  assert.equal(await remotes.get('github'), first, 'the same target keeps its adapter');
  const replaced: string[] = [];
  remotes.onReplaced((k) => replaced.push(k));
  choose('octo-org/other');
  const second = await remotes.get('github');
  assert.notEqual(second, first);
  assert.equal(second.location, 'octo-org/other');
  assert.deepEqual(replaced, ['github']);
  remotes.close();
});

test('an event stream moves to the new adapter and tells the page to read again', async () => {
  const { choose, remotes } = setup();
  const source = {
    adapter: () => remotes.get('github'),
    onReplaced: (fn: () => void) => remotes.onReplaced(() => fn()),
  };
  const server = http.createServer((req, res) => streamTrackerEvents(source, req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const ctrl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  let text = '';
  const until = async (re: RegExp) => {
    while (!re.test(text)) text += new TextDecoder().decode((await reader.read()).value);
  };
  await until(/"location":"octo-org\/launchpad"/);
  choose('octo-org/other');
  await remotes.get('github');
  await until(/"location":"octo-org\/other"/);
  await until(/external\.changed/);
  ctrl.abort();
  server.close();
  remotes.close();
});
