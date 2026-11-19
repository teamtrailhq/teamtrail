import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ExternalChanges } from '../src/adapters/markdown/externalChanges';
import { SelfWrites } from '../src/adapters/markdown/selfWrites';
import { machineStore } from '../src/machine/machineStore';
import type { TrackerEvent } from '../src/model/types';
import { watchMachineStore } from '../src/server/watchMachineStore';
import { tempFolder } from './tempFolder';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Watches a fresh project's machine store, collecting what it sends. */
function watched() {
  const root = tempFolder('tt-store-root-');
  const configDir = tempFolder('tt-store-config-');
  const dir = machineStore(root, configDir).dir;
  mkdirSync(path.join(dir, 'signed-state'), { recursive: true });
  const sent: string[] = [];
  const stop = watchMachineStore({ root, configDir, send: (t) => sent.push(t), pollMs: 20 });
  const write = (rel: string, text: string) => writeFileSync(path.join(dir, rel), text);
  return { sent, stop, write };
}

test('an approval written by another process (teamtrail approve, another tab) sends a trust event naming the file', async () => {
  const w = watched();
  w.write('approvals.json', '{"items":{}}');
  await wait(120);
  w.write('signed-state/trail-1.json', '{}');
  await wait(120);
  w.stop();
  const trust = w.sent.filter((t) => t.startsWith('event: trust'));
  assert.equal(trust.length, 2);
  assert.match(trust[0], /"files":\["approvals.json"\]/);
  assert.match(trust[1], /"files":\["signed-state\/trail-1.json"\]/);
});

test('sign-ins, locks and temp files send no trust event; a pairing sends sign-in', async () => {
  const w = watched();
  w.write('sign-in.json', '{}');
  w.write('approvals.json.lock', '1');
  w.write('approvals.json.123.tmp', '{}');
  await wait(120);
  w.stop();
  assert.deepEqual(w.sent, ['event: sign-in\ndata: {}\n\n']);
});

test('a decision reworded, reverted or deleted outside Teamtrail tells the page the trail changed', async () => {
  const files: Record<string, string> = { 'm/decisions/D-1.md': '---\nid: D-1\nticket: "1"\n---\n\nOld rationale\n' };
  const events: TrackerEvent[] = [];
  const ext = new ExternalChanges(
    async (p) => files[p] ?? Promise.reject(new Error('gone')),
    (e) => events.push(e),
  );
  ext.remember('m/decisions/D-1.md', files['m/decisions/D-1.md']);
  files['m/decisions/D-1.md'] = files['m/decisions/D-1.md'].replace('Old', 'New');
  ext.queue('m/decisions/D-1.md');
  await wait(300);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['external.changed'],
  );
  delete files['m/decisions/D-1.md'];
  ext.queue('m/decisions/D-1.md');
  await wait(300);
  assert.equal(events.length, 2);
  // a duplicate watcher hit with nothing new stays quiet
  ext.queue('m/decisions/D-1.md');
  await wait(300);
  assert.equal(events.length, 2);
});

test("a hit just after this adapter's write is its echo only while the file holds what it wrote", async () => {
  const files: Record<string, string> = {};
  const self = new SelfWrites(async (p) => files[p]);
  files['m/tickets/1.md'] = 'mine';
  self.wrote('m/tickets/1.md', 'mine');
  assert.equal(await self.echo('m/tickets/1.md'), true);
  files['m/tickets/1.md'] = 'an agent wrote this in the same moment';
  assert.equal(await self.echo('m/tickets/1.md'), false);
  assert.equal(await self.echo('m/tickets/2.md'), false);
});
