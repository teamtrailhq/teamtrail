import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { withMapMeta } from '../src/adapters/mapMeta';
import { parseMapFile, serializeMapFile } from '../src/adapters/markdown/mapFile';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { mapBody } from '../src/adapters/remote/format';
import { mapFromIssue } from '../src/adapters/remote/issueMapping';
import { buildAttention } from '../src/attention/buildAttention';
import type { MapDoc, MapSnapshot, Ticket, TicketType } from '../src/model/types';
import { setModelMatching } from '../src/planning/lifecycle/setModelMatching';
import {
  effectiveTiers,
  modelWaits,
  parseModelsConfig,
  rankForSession,
  tierOfModel,
  tierOfTicket,
} from '../src/planning/matching';
import { readModelsConfig } from '../src/planning/matching/modelsStore';
import { chartMap } from '../src/planning/operations/chart';
import { chooseNext, orderNext } from '../src/planning/operations/claims';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

function ticket(id: string, type: TicketType, extra: Partial<Ticket> = {}): Ticket {
  return {
    id,
    key: `#${id}`,
    title: `${type} ${id}`,
    type,
    body: '',
    state: 'open',
    blockedBy: [],
    comments: [],
    createdAt: Number(id),
    updatedAt: Number(id),
    ...extra,
  };
}

function snapOf(tickets: Ticket[], modelMatching?: MapDoc['modelMatching']): MapSnapshot {
  const map: MapDoc = {
    id: 'm1',
    key: '#1',
    title: 'Trail',
    mode: 'plan+execute',
    sections: SECTIONS,
    createdAt: 0,
    updatedAt: 0,
    ...(modelMatching ? { modelMatching } : {}),
  };
  return { map, tickets };
}

test('model families: current Claude and OpenAI ids map to their tier', () => {
  const tiers = Object.fromEntries(
    [
      'claude-opus-4-1-20250805',
      'claude-sonnet-4-5',
      'claude-haiku-4-5-20251001',
      'claude-fable-5',
      'claude-3-5-haiku-20241022',
      'us.anthropic.claude-opus-4-1',
      'gpt-5',
      'gpt-5-codex',
      'gpt-5-mini',
      'gpt-5.1-codex-mini',
      'gpt-4.1-nano',
      'o3',
      'o4-mini',
      'gpt-4.1',
    ].map((m) => [m, tierOfModel(m).tier]),
  );
  assert.deepEqual(tiers, {
    'claude-opus-4-1-20250805': 'strongest',
    'claude-sonnet-4-5': 'balanced',
    'claude-haiku-4-5-20251001': 'fast',
    'claude-fable-5': 'strongest',
    'claude-3-5-haiku-20241022': 'fast',
    'us.anthropic.claude-opus-4-1': 'strongest',
    'gpt-5': 'strongest',
    'gpt-5-codex': 'strongest',
    'gpt-5-mini': 'fast',
    'gpt-5.1-codex-mini': 'fast',
    'gpt-4.1-nano': 'fast',
    o3: 'strongest',
    'o4-mini': 'fast',
    'gpt-4.1': 'balanced',
  });
});

test('no model or an unknown one counts as balanced, with the reason', () => {
  assert.deepEqual(tierOfModel(undefined), {
    tier: 'balanced',
    source: 'unknown',
    reason: 'no model reported, so it counts as balanced',
  });
  const odd = tierOfModel('llama-local-7b');
  assert.equal(odd.tier, 'balanced');
  assert.equal(odd.source, 'unknown');
  assert.match(odd.reason, /llama-local-7b is not a known model/);
});

test("the project's models.json comes before the built-in families, exact ids before globs", () => {
  const extra = { 'acme-*': 'strongest', 'claude-sonnet-4-5': 'strongest', 'acme-tiny': 'fast' } as const;
  assert.equal(tierOfModel('acme-large', extra).tier, 'strongest');
  assert.equal(tierOfModel('acme-tiny', extra).tier, 'fast');
  assert.equal(tierOfModel('claude-sonnet-4-5', extra).source, 'project');
  assert.equal(tierOfModel('claude-sonnet-4-5', extra).tier, 'strongest');
  assert.equal(tierOfModel('claude-haiku-4-5', extra).tier, 'fast');
});

test('models.json is validated by hand: unknown keys and tiers are errors', () => {
  assert.deepEqual(parseModelsConfig('{"v":1,"models":{"acme-*":"strongest"}}'), {
    models: { 'acme-*': 'strongest' },
    errors: [],
  });
  assert.deepEqual(parseModelsConfig('{"v":1,"models":{"acme":"huge"},"extra":true}').errors, [
    'unknown key "extra"',
    '"acme" must be one of fast, balanced, strongest',
  ]);
  assert.deepEqual(parseModelsConfig('{"v":2}').errors, ['"v" must be 1']);
  assert.match(parseModelsConfig('{').errors[0], /not valid JSON/);
  const root = mkdtempSync(path.join(os.tmpdir(), 'models-'));
  assert.deepEqual(readModelsConfig(root), { models: {}, errors: [], exists: false });
  writeFileSync(path.join(root, 'models.json'), '{"v":1,"models":{"acme":"nope"}}');
  assert.deepEqual(readModelsConfig(root), {
    models: {},
    errors: ['"acme" must be one of fast, balanced, strongest'],
    exists: true,
  });
});

test('ticket tiers: defaults per type, overridden per trail', () => {
  const plain = snapOf([]).map;
  assert.deepEqual(effectiveTiers(plain), {
    research: 'fast',
    prototype: 'strongest',
    junction: 'strongest',
    task: 'balanced',
    execute: 'balanced',
    review: 'strongest',
  });
  const own = snapOf([], { enabled: true, tiers: { research: 'strongest', junction: 'balanced' } }).map;
  assert.equal(tierOfTicket({ type: 'research' }, own), 'strongest');
  assert.equal(tierOfTicket({ type: 'junction' }, own), 'balanced');
  assert.equal(tierOfTicket({ type: 'task' }, own), 'balanced');
});

test('ranking: own tier first, then lower tiers nearest first, never higher; ties keep the order', () => {
  const tickets = [ticket('1', 'research'), ticket('2', 'junction'), ticket('3', 'task'), ticket('4', 'research')];
  const snap = snapOf(tickets, { enabled: true });
  const order = orderNext(snap);
  const keys = (ts: Ticket[]) => ts.map((t) => t.id);
  assert.deepEqual(keys(rankForSession(order, 'fast', snap.map)), ['1', '4']);
  assert.deepEqual(keys(rankForSession(order, 'balanced', snap.map)), ['3', '1', '4']);
  assert.deepEqual(keys(rankForSession(order, 'strongest', snap.map)), ['2', '3', '1', '4']);
  // A strong session takes lower-tier work when nothing at its tier is ready.
  const onlyResearch = snapOf([ticket('1', 'research')], { enabled: true });
  assert.deepEqual(keys(rankForSession(orderNext(onlyResearch), 'strongest', onlyResearch.map)), ['1']);
  // A fast session never gets a higher-tier ticket on its own.
  const onlyJunction = snapOf([ticket('2', 'junction')], { enabled: true });
  assert.deepEqual(rankForSession(orderNext(onlyJunction), 'fast', onlyJunction.map), []);
});

test('orderNext keeps chooseNext: its first is the ticket chooseNext picks', () => {
  const snap = snapOf([ticket('1', 'research'), ticket('2', 'junction', { blockedBy: ['1'] }), ticket('3', 'task')]);
  assert.deepEqual(
    orderNext(snap).map((t) => t.id),
    ['1', '3'],
  );
  assert.equal(chooseNext(snap)?.id, '1');
  assert.equal(chooseNext(snap, { types: ['task'] })?.id, '3');
});

test('waiting on a model: only with matching on and an agent connected, for tiers above the strongest agent', () => {
  const tickets = [ticket('1', 'research'), ticket('2', 'junction'), ticket('3', 'prototype', { assignee: 'x' })];
  const on = snapOf(tickets, { enabled: true });
  const balanced = [{ agent: 'claude-01', tier: 'balanced' as const }];
  assert.deepEqual(
    modelWaits(on, balanced).map((w) => [w.ticketKey, w.tier, w.best]),
    [['#2', 'strongest', 'balanced']],
  );
  assert.deepEqual(modelWaits(on, []), [], 'nobody connected: nothing to wait for');
  assert.deepEqual(modelWaits(snapOf(tickets), balanced), [], 'matching off');
  assert.deepEqual(modelWaits(on, [...balanced, { agent: 'claude-02', tier: 'strongest' }]), []);

  const queue = buildAttention({
    snaps: [on],
    questions: [],
    sessions: [],
    approvals: [],
    syncs: [],
    leases: [],
    knowledge: [],
    briefs: [],
    agents: balanced,
    now: 10_000,
  });
  const item = queue.items.find((i) => i.kind === 'model');
  assert.equal(item?.title, '#2 needs a strongest model');
  assert.equal(item?.ticketId, '2');
  assert.ok(item?.reasons.includes('connected agents run balanced at most'), item?.reasons.join('; '));
});

test('model matching round-trips through map.md frontmatter and the trail issue meta marker', () => {
  const base = snapOf([]).map;
  const on: MapDoc = { ...base, modelMatching: { enabled: true, tiers: { research: 'balanced', review: 'fast' } } };
  const md = serializeMapFile(on);
  assert.match(md, /^model-matching: on$/m);
  assert.match(md, /^model-tiers: \[research=balanced, review=fast\]$/m);
  assert.deepEqual(parseMapFile('m1', md).modelMatching, on.modelMatching);
  const off: MapDoc = { ...base, modelMatching: { enabled: false } };
  assert.deepEqual(parseMapFile('m1', serializeMapFile(off)).modelMatching, { enabled: false });
  assert.equal(parseMapFile('m1', serializeMapFile(base)).modelMatching, undefined, 'missing means off');
  assert.doesNotMatch(serializeMapFile(base), /model-/);

  // GitHub and Linear share the body format: the meta marker on the trail issue.
  const issue = (m: MapDoc) =>
    mapFromIssue({ id: '1', key: '#1', title: 'T', labels: [], body: mapBody(m), createdAt: '', updatedAt: '' });
  assert.deepEqual(issue(on).modelMatching, on.modelMatching);
  assert.deepEqual(issue({ ...on, verification: 'checks' }).verification, 'checks');
  assert.equal(issue(base).modelMatching, undefined);
  assert.doesNotMatch(mapBody(base), /teamtrail:meta/, 'no marker when nothing is set');

  assert.deepEqual(withMapMeta(base, { modelMatching: { enabled: true } }).modelMatching, { enabled: true });
  assert.equal(withMapMeta(on, { modelMatching: null }).modelMatching, undefined);
  assert.deepEqual(withMapMeta(on, { verification: 'checks' }).modelMatching, on.modelMatching);
});

test('only the trail lead sets model matching, and it is checked and stored on the trail', async () => {
  const a = new MemoryAdapter({ latency: [0, 0] });
  const { map } = await chartMap(a, { title: 'T', sections: SECTIONS, tickets: [] });
  await assert.rejects(setModelMatching(a, map.id, { enabled: true }, 'agent'), /only the trail lead/);
  await assert.rejects(
    setModelMatching(a, map.id, { enabled: true, tiers: { research: 'huge' as never } }, 'trail lead'),
    /fast, balanced or strongest/,
  );
  await setModelMatching(a, map.id, { enabled: true, tiers: { research: 'strongest' } }, 'trail lead');
  assert.deepEqual((await a.loadMap(map.id)).map.modelMatching, { enabled: true, tiers: { research: 'strongest' } });
  await setModelMatching(a, map.id, null, 'trail lead');
  assert.equal((await a.loadMap(map.id)).map.modelMatching, undefined);
});
