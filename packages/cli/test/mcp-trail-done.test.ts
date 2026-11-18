import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agents } from './fakes/agents';

let repo: string;
let root: string;
const hub = agents(() => root);

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-trail-done-')));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  await hub.closeAll();
  fs.rmSync(repo, { recursive: true, force: true });
});

type Started = { trail: { id: string; key: string }; tickets: { key: string }[] };
type Closed = { trailDone: boolean; trail: string };

describe('agents and the Lookout agree on when a trail is done', () => {
  it('closing the last research ticket is not the destination while the plan is still to be charted', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const m = (await call('start_trail', {
      title: 'Exports',
      destination: 'Clients export data',
      tickets: [{ ref: 'r', title: 'Which format?', type: 'research' }],
    })) as Started;
    // the discovery brief's research ticket, then the one charted
    let closed: Closed | undefined;
    for (const t of m.tickets) {
      await call('claim_ticket', { ticket: t.key });
      closed = (await call('close_ticket', { resolution: 'Read it' })) as Closed;
    }
    expect(closed).toMatchObject({ trailDone: false, trail: "The plan isn't charted yet" });
    expect(await call('next_ticket', { trail: m.trail.key })).toMatchObject({
      ticket: null,
      reason: /the trail isn't done: The plan isn't charted yet/,
    });
  });
});
