import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { rerouteSource } from '../src/attention/sources/rerouteSource';
import { journalFile } from '../src/history/journalFile';
import type { RerouteProposal } from '../src/model/reroute';
import { chartMap } from '../src/planning/operations/chart';
import { approveReroute } from '../src/planning/reroute/decideReroute';
import { rerouteHash } from '../src/planning/reroute/rerouteApproval';
import { proposeReroute } from '../src/planning/reroute/rerouteFlow';
import { readReroute, writeReroute } from '../src/planning/reroute/rerouteStore';

/*
 * A setting request shows one change and applies exactly that: anything else in the setting lane is refused, a
 * setting change never rides along in another lane, and the lane and the proposer are part of what is approved.
 */
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

async function setup() {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-shape-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'T',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'A', type: 'task', body: '' }],
  });
  const env = { root, adapter, journal: journalFile(root) };
  return { root, adapter, env, mapId: map.id, ticket: tickets[0] };
}

const request = (mapId: string, changes: RerouteProposal['changes'], lane?: RerouteProposal['lane']) => ({
  mapId,
  kind: 'reroute' as const,
  ...(lane ? { lane } : {}),
  reason: 'r',
  evidence: 'e',
  invalidates: [],
  changes,
  by: 'claude-01',
});

test('the attack: a hand-written setting request with three changes; approving it is refused, nothing applied', async () => {
  const t = await setup();
  const r = await proposeReroute(t.env, request(t.mapId, [{ op: 'set_mode', mode: 'plan-only' }], 'setting'));
  const forged: RerouteProposal = {
    ...r.proposal,
    changes: [
      { op: 'set_mode', mode: 'plan-only' },
      { op: 'update_destination', text: 'Something else' },
      { op: 'cancel_ticket', ticket: t.ticket.id, reason: 'gone' },
    ],
  };
  writeReroute(t.root, forged);
  await assert.rejects(
    approveReroute(t.env, { mapId: t.mapId, id: forged.id, by: 'trail lead', hash: rerouteHash(forged) }),
    /a setting request is exactly one change/,
  );
  const snap = await t.adapter.loadMap(t.mapId);
  assert.equal(snap.map.mode, 'plan+execute');
  assert.equal(snap.map.sections.destination, 'D');
  assert.equal(snap.tickets[0].state, 'open');
  assert.equal(readReroute(t.root, t.mapId, forged.id)?.status, 'pending');
});

test('a setting change never rides in a plan proposal or a rule-out', async () => {
  const t = await setup();
  await assert.rejects(
    proposeReroute(t.env, request(t.mapId, [{ op: 'skip_discovery' }])),
    /only a setting request may carry it/,
  );
  await assert.rejects(
    proposeReroute(t.env, request(t.mapId, [{ op: 'set_mode', mode: 'plan-only' }], 'rule-out')),
    /only a setting request may carry it/,
  );
});

test('the lane and who asked are part of what is approved', async () => {
  const t = await setup();
  const r = await proposeReroute(t.env, request(t.mapId, [{ op: 'set_mode', mode: 'plan-only' }], 'setting'));
  const shown = rerouteHash(r.proposal);
  assert.notEqual(rerouteHash({ ...r.proposal, by: 'trail lead' }), shown);
  assert.notEqual(rerouteHash({ ...r.proposal, lane: undefined }), shown);
  writeReroute(t.root, { ...r.proposal, by: 'trail lead' });
  await assert.rejects(
    approveReroute(t.env, { mapId: t.mapId, id: r.proposal.id, by: 'trail lead', hash: shown }),
    /changed since you looked at it/,
  );
});

test('the queue shows a well-formed setting request as its one change, and anything else as a plain reroute', async () => {
  const t = await setup();
  const r = await proposeReroute(t.env, request(t.mapId, [{ op: 'set_mode', mode: 'plan-only' }], 'setting'));
  const collect = (p: RerouteProposal) =>
    rerouteSource.collect({ reroutes: [{ proposal: p, frozen: [] }] } as never)[0];
  assert.match(collect(r.proposal).title, /^claude-01 asks to switch the trail to plan-only/);
  const two: RerouteProposal = {
    ...r.proposal,
    changes: [
      { op: 'set_mode', mode: 'plan-only' },
      { op: 'update_destination', text: 'X' },
    ],
  };
  assert.match(collect(two).title, /^Review R-1: r/);
});
