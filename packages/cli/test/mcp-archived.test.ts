import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MarkdownAdapter, setTrailArchived } from '@teamtrail/core';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agents } from './fakes/agents';

let repo: string;
let root: string;
const hub = agents(() => root);

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-archived-')));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  await hub.closeAll();
  fs.rmSync(repo, { recursive: true, force: true });
});

const adapter = () => new MarkdownAdapter(nodeMarkdownFs(root), root);
const TICKETS = [{ ref: 'a', title: 'Do it', type: 'task' }];
type Started = { trail: { id: string; key: string } };

describe('an archived trail', () => {
  it('is never an agent’s default trail, offers no work, and takes no tickets', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const old = (await call('start_trail', {
      discovery: false,
      title: 'Old',
      destination: 'D',
      tickets: TICKETS,
    })) as Started;
    await setTrailArchived(adapter(), old.trail.id, true, 'trail lead');

    // the only trail is archived: nothing to resume by default, but it still reads as history when named
    await expect(call('resume_trail')).rejects.toThrow(/Every trail is archived/);
    expect(await call('status')).toMatchObject({ trail: null, trails: [{ id: old.trail.id, archived: true }] });
    expect(await call('next_ticket', { trail: old.trail.key })).toMatchObject({ ticket: null, reason: /archived/ });
    await expect(call('claim_ticket', { trail: old.trail.key })).rejects.toThrow(/archived/);
    await expect(call('add_ticket', { trail: old.trail.key, title: 'More', type: 'task' })).rejects.toThrow(/archived/);

    // a new trail is the default again; restoring the old one makes its work available
    const next = (await call('start_trail', {
      discovery: false,
      title: 'New',
      destination: 'D',
      tickets: TICKETS,
    })) as Started;
    expect(await call('status')).toMatchObject({ trail: { id: next.trail.id } });
    await setTrailArchived(adapter(), old.trail.id, false, 'trail lead');
    expect(await call('next_ticket', { trail: old.trail.key })).toMatchObject({ ticket: { title: 'Do it' } });
  });
});
