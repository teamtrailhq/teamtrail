import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseMapFile, serializeMapFile } from '../src/adapters/markdown/mapFile';
import { parseTicket, serializeTicket } from '../src/adapters/markdown/ticketFile';
import { settingsChanges, settingsKey, settingsOf } from '../src/adapters/remote/bodySettings';
import { mapBody, splitBody } from '../src/adapters/remote/format';
import { BUILTIN_GUIDES } from '../src/guides/builtin/builtinGuides';
import { readChecklist } from '../src/guides/checklistStore';
import { checkGuideChecklists } from '../src/guides/guideChecklists';
import { parseGuide } from '../src/guides/guideFile';
import { GUIDES_PAYLOAD_BYTES, guidesPayload } from '../src/guides/guidesPayload';
import { listGuides } from '../src/guides/guideStore';
import { resolveGuides } from '../src/guides/resolveGuides';
import { ticketGuideIds } from '../src/guides/ticketGuideIds';
import { trailGuidesByType } from '../src/guides/trailGuidesByType';
import type { MapDoc, Ticket } from '../src/model/types';
import { ticketGuidesPatch } from '../src/planning/lifecycle/setTicketGuides';
import { withMapFields, withTicketFields } from '../src/signedState/applyFields';
import { changedKeys, mapFields, ticketFields } from '../src/signedState/stateFields';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const map = (over: Partial<MapDoc> = {}): MapDoc => ({
  id: 'm',
  key: 'M-1',
  title: 'T',
  mode: 'plan+execute',
  sections: SECTIONS,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: '1',
  key: '#1',
  title: 'Build',
  type: 'task',
  state: 'open',
  body: '',
  blockedBy: [],
  comments: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const ids = (m: MapDoc, t: Ticket) => ticketGuideIds(m, t).map((r) => `${r.id}:${r.via}`);

test('a trail without a mapping takes the defaults; an old team keeps them within it; its own mapping is used as is', () => {
  const defaults = trailGuidesByType(map());
  assert.equal(defaults.source, 'defaults');
  assert.deepEqual(defaults.byType, {
    research: ['architect'],
    prototype: ['architect'],
    junction: ['architect'],
    task: ['qa', 'security'],
    execute: ['qa', 'security'],
    review: ['reviewer'],
  });
  const team = trailGuidesByType(map({ guides: ['qa', 'reviewer', 'docs'] }));
  assert.equal(team.source, 'team');
  assert.deepEqual([team.byType.task, team.byType.research, team.byType.review], [['qa'], [], ['reviewer']]);
  const own = trailGuidesByType(map({ guides: ['qa'], guidesByType: { task: ['docs'] } }));
  assert.equal(own.source, 'trail');
  assert.deepEqual([own.byType.task, own.byType.research], [['docs'], []], 'a mapping of its own ignores the team');
  assert.deepEqual(trailGuidesByType(map({ guidesByType: {} })).byType.task, [], '{} turns every type off');
});

test("a ticket's guides: its type's, plus added, minus removed; the single guide of older tickets counts as added", () => {
  assert.deepEqual(ids(map(), ticket()), ['qa:type', 'security:type']);
  assert.deepEqual(ids(map(), ticket({ guide: 'docs' })), ['qa:type', 'security:type', 'docs:ticket']);
  assert.deepEqual(ids(map(), ticket({ guide: 'qa' })), ['qa:type', 'security:type'], 'once, as its type gives it');
  assert.deepEqual(ids(map(), ticket({ guidesAdded: ['docs'], guidesRemoved: ['security'] })), [
    'qa:type',
    'docs:ticket',
  ]);
  assert.deepEqual(ids(map(), ticket({ type: 'research' })), ['architect:type']);
  assert.deepEqual(ids(map(), ticket({ type: 'review' })), ['reviewer:type']);
});

test('changing one ticket moves the old single guide into the added list and keeps added and removed apart', () => {
  const t = ticket({ guide: 'docs' });
  assert.deepEqual(ticketGuidesPatch(map(), t, { kind: 'remove', id: 'security' }), {
    guide: null,
    guidesAdded: ['docs'],
    guidesRemoved: ['security'],
  });
  const off = ticket({ guidesRemoved: ['security'], guidesAdded: ['docs'] });
  assert.deepEqual(ticketGuidesPatch(map(), off, { kind: 'add', id: 'security' }), {
    guide: null,
    guidesAdded: ['docs'],
    guidesRemoved: null,
  });
  assert.deepEqual(ticketGuidesPatch(map(), off, { kind: 'remove', id: 'docs' }), {
    guide: null,
    guidesAdded: null,
    guidesRemoved: ['security'],
  });
});

test('map.md and ticket files round-trip guides by type and overrides; a file without them reads as before', () => {
  const m = map({ guidesByType: { research: ['architect', 'team-notes'], task: ['qa'] } });
  const text = serializeMapFile(m);
  assert.match(text, /guides-by-type:/);
  assert.deepEqual(parseMapFile('m', text).guidesByType, m.guidesByType);
  assert.deepEqual(parseMapFile('m', serializeMapFile(map({ guidesByType: {} }))).guidesByType, {});
  assert.equal(parseMapFile('m', serializeMapFile(map())).guidesByType, undefined);
  const t = ticket({ guidesAdded: ['docs'], guidesRemoved: ['security'] });
  const back = parseTicket(serializeTicket(t));
  assert.deepEqual([back.guidesAdded, back.guidesRemoved], [['docs'], ['security']]);
  assert.equal(parseTicket(serializeTicket(ticket())).guidesAdded, undefined);
});

test('the mapping and the overrides are signed fields; a record from before them still matches an unchanged trail', () => {
  const m = map({ guidesByType: { task: ['qa'] } });
  assert.equal(typeof mapFields(m).guides_by_type, 'string');
  const old = Object.fromEntries(Object.entries(mapFields(map())).filter(([k]) => k !== 'guides_by_type'));
  assert.deepEqual(changedKeys(old, mapFields(map())), [], 'unset reads as null, like a key the record lacks');
  assert.deepEqual(changedKeys(mapFields(map()), mapFields(m)), ['guides_by_type']);
  assert.deepEqual(withMapFields(map(), mapFields(m)).guidesByType, { task: ['qa'] });
  const t = ticket({ guidesAdded: ['docs'] });
  assert.deepEqual(changedKeys(ticketFields(ticket()), ticketFields(t)), ['guides_added']);
  assert.deepEqual(withTicketFields(ticket(), ticketFields(t)).guidesAdded, ['docs']);
});

test('GitHub and Linear keep the mapping and overrides in the meta marker, compared as settings', () => {
  const body = mapBody(map({ guidesByType: { task: ['security', 'qa'] } }));
  const { meta } = splitBody(body);
  assert.deepEqual(settingsOf({ ...meta }).guidesByType, { task: ['security', 'qa'] });
  assert.deepEqual(settingsOf({ guidesByType: {} }).guidesByType, {}, 'no guides for any type is a setting too');
  assert.notEqual(settingsKey({ guidesByType: {} }), settingsKey({}));
  assert.deepEqual(settingsChanges({}, { guidesByType: { task: ['qa'] }, guidesAdded: ['docs'] }), [
    'guides added: not set → docs',
    'guides by type: not set → task qa',
  ]);
});

test('each guide’s checklist is checked on its own; a number needs its guide when several have checklists', () => {
  const guides = listGuides(path.join(mkdtempSync(path.join(os.tmpdir(), 'tt-gbt-')), '.teamtrail'));
  const doc = (id: string) => guides.find((r) => r.id === id)!.guide!;
  const [qa, security] = [doc('qa'), doc('security')];
  const all = [
    ...qa.checklist.map((item) => ({ item, done: true })),
    ...security.checklist.map((item) => ({ item, done: true })),
  ];
  assert.deepEqual(checkGuideChecklists([qa, security], all).problems, [], 'item texts place themselves');
  const numbered = checkGuideChecklists([qa, security], [{ item: '1', done: true }]);
  assert.equal(numbered.problems.length, 2);
  assert.match(numbered.problems[0], /Not on the checklist: "1"/);
  const named = qa.checklist.map((_, i) => ({ guide: 'qa', item: String(i + 1), done: true }));
  const r = checkGuideChecklists([qa, security], named);
  assert.equal(r.problems.length, 1, 'qa is complete; security is not');
  assert.match(r.problems[0], /Security guide \(security\)/);
  assert.equal(r.answered[0].answers.length, qa.checklist.length);
  const one = checkGuideChecklists([qa], [{ item: '#1', done: false, note: 'n' }]);
  assert.match(one.problems[0], /Missing: "Added or updated tests/);
});

test('a claim carries every active guide, the instructions only while they fit; disabled ones as warnings', () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'tt-gbt-')), '.teamtrail');
  mkdirSync(path.join(root, 'guides'), { recursive: true });
  writeFileSync(path.join(root, 'guides', 'qa.md'), BUILTIN_GUIDES.qa.replace('1.0.0', '9.0.0'));
  const list = resolveGuides(listGuides(root), { map: map(), ticket: ticket({ guidesAdded: ['nope'] }) });
  const payload = guidesPayload(list);
  assert.deepEqual(
    payload.guides.map((g) => [g.id, g.via]),
    [
      ['qa', 'type'],
      ['security', 'type'],
    ],
    'the built-in qa stays active until the file replacing it is approved',
  );
  assert.equal(payload.warnings.length, 1);
  assert.match(payload.warnings[0], /guide nope, which can't be used now \(not installed\)/);
  const big = 'x'.repeat(GUIDES_PAYLOAD_BYTES - 10);
  const active = list.filter((r) => r.kind === 'active');
  const huge = active.map((r) => (r.kind === 'active' ? { ...r, guide: { ...r.guide, instructions: big } } : r));
  const capped = guidesPayload(huge);
  assert.deepEqual(
    capped.guides.map((g) => [g.id, !!g.instructionsOmitted]),
    [
      ['qa', false],
      ['security', true],
    ],
  );
  assert.ok(parseGuide(BUILTIN_GUIDES.docs).guide);
});

test('checklist answers from before guides came by type read as one guide’s', () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'tt-gbt-')), '.teamtrail');
  const dir = path.join(root, '.evidence', 'm', '1');
  mkdirSync(dir, { recursive: true });
  const v1 = { v: 1, mapId: 'm', ticketId: '1', guide: { id: 'qa', version: '1.0.0' }, answers: [], by: 'a', at: 1 };
  writeFileSync(path.join(dir, 'checklist.json'), JSON.stringify(v1));
  const rec = readChecklist(root, 'm', '1')!;
  assert.deepEqual(rec.guides, [{ guide: { id: 'qa', version: '1.0.0' }, answers: [] }]);
  assert.equal(rec.v, 2);
  assert.ok(readFileSync(path.join(dir, 'checklist.json'), 'utf8').includes('"v":1'), 'the file is left as it is');
});
