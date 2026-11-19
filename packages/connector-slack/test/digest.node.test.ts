import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempFolder } from '../../core/test/tempFolder';
import { flushBatches } from '../src/service/notifications';
import { queueLine } from '../src/service/queueLine';
import type { SlackContext } from '../src/service/slackContext';

/** Just what flushBatches and queueLine touch: options, batches, a channel and chat.postMessage. */
function fakeContext(root: string, clock: { now: number }) {
  const posts: string[] = [];
  const ctx = {
    o: { root, now: () => clock.now },
    batches: new Map(),
    target: async () => 'C1',
    call: async (_method: string, args: { text: string }) => {
      posts.push(args.text);
      return { ts: `${posts.length}` };
    },
  } as unknown as SlackContext;
  return { ctx, posts };
}

test('the Slack digest follows digestMinutes in attention.json, re-read on every flush', async () => {
  const root = tempFolder('teamtrail-digest-');
  try {
    const clock = { now: 1_000_000 };
    const { ctx, posts } = fakeContext(root, clock);
    writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1, digestMinutes: 10 }));

    queueLine(ctx, 'm1', '#4 blocked');
    await flushBatches(ctx);
    assert.deepEqual(posts, ['#4 blocked'], 'the first digest of a trail goes out right away');

    queueLine(ctx, 'm1', '#5 resolved');
    clock.now += 9 * 60_000;
    await flushBatches(ctx);
    assert.equal(posts.length, 1, 'within the window, lines wait');
    clock.now += 60_000;
    await flushBatches(ctx);
    assert.deepEqual(posts.at(-1), '#5 resolved', 'after digestMinutes, the digest goes out');

    writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1, digestMinutes: 1 }));
    queueLine(ctx, 'm1', '#6 done');
    clock.now += 61_000;
    await flushBatches(ctx);
    assert.equal(posts.at(-1), '#6 done', 'an edited cadence applies on the next flush');

    writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1, digestMinutes: 0 }));
    queueLine(ctx, 'm1', '#7 blocked');
    clock.now += 24 * 60 * 60_000;
    await flushBatches(ctx);
    assert.equal(posts.length, 3, 'digestMinutes 0 turns the digest off');
    assert.equal(ctx.batches.get('m1')?.lines.length, 0, 'and the lines are dropped, not kept for later');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
