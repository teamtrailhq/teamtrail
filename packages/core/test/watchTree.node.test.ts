import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { rawMarkdownFs } from '../src/adapters/markdown/rawMarkdownFs';
import { watchTree } from '../src/lib/watchTree';
import { writeTrackerFile } from '../src/signedState/trackerFileWrite';

/*
 * Teamtrail writes a tracker file to a temp file and renames it over the name (trackerFileWrite.ts). On Linux,
 * Node's recursive fs.watch reported such a file once and then never again, so the Lookout missed an agent's claim
 * of a ticket it had just added, and showed the ticket as waiting until something else changed.
 */

const TICKET = 'trail/tickets/6.md';

function folder() {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-watch-')), '.teamtrail');
  mkdirSync(path.join(root, 'trail', 'tickets'), { recursive: true });
  return root;
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Resolves once `seen` holds more than `count` reports of `rel`; rejects after a few seconds. */
async function reported(seen: string[], rel: string, count: number, what: string) {
  const until = Date.now() + 4000;
  while (seen.filter((r) => r === rel).length <= count) {
    if (Date.now() > until) assert.fail(`${what}: not reported (reports so far: ${JSON.stringify(seen)})`);
    await pause(20);
  }
  // a write can be reported twice: let the second land before the next write counts its own
  await pause(150);
  return seen.filter((r) => r === rel).length;
}

async function everyRewriteReported(watchFn: (root: string, cb: (rel: string) => void) => () => void) {
  const root = folder();
  const seen: string[] = [];
  const stop = watchFn(root, (rel) => seen.push(rel));
  try {
    await pause(100);
    writeTrackerFile({ root, rel: TICKET, text: 'added\n', create: true });
    let count = await reported(seen, TICKET, 0, 'the new ticket');
    for (const step of ['charted', 'claimed', 'released', 'claimed again']) {
      writeTrackerFile({ root, rel: TICKET, text: `${step}\n` });
      count = await reported(seen, TICKET, count, `the ticket ${step}`);
    }
  } finally {
    stop();
  }
}

test('the tracker folder watch reports a ticket every time Teamtrail rewrites it, not only the first', async () => {
  await everyRewriteReported((root, cb) => rawMarkdownFs(root).watch!(cb));
});

test('watching folder by folder (as on Linux) reports every rewrite too', async () => {
  await everyRewriteReported((root, cb) => watchTree(root, cb, { native: false }));
});

test('watching folder by folder: a folder made later is watched, and what is already in it reported', async () => {
  const root = folder();
  const seen: string[] = [];
  const stop = watchTree(root, (rel) => seen.push(rel), { native: false });
  try {
    await pause(100);
    mkdirSync(path.join(root, 'later', 'tickets'), { recursive: true });
    writeFileSync(path.join(root, 'later', 'tickets', '1.md'), 'one\n');
    let count = await reported(seen, 'later/tickets/1.md', 0, 'a ticket in a new trail');
    writeTrackerFile({ root, rel: 'later/tickets/1.md', text: 'claimed\n' });
    count = await reported(seen, 'later/tickets/1.md', count, 'that ticket rewritten');
    writeTrackerFile({ root, rel: 'later/tickets/1.md', text: 'closed\n' });
    await reported(seen, 'later/tickets/1.md', count, 'that ticket rewritten again');
  } finally {
    stop();
  }
  const after = seen.length;
  writeFileSync(path.join(root, 'trail', 'tickets', '2.md'), 'two\n');
  await pause(300);
  assert.equal(seen.length, after, 'nothing is reported once stopped');
});
