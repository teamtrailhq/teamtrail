import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMapFile, serializeMapFile } from '../src/adapters/markdown/mapFile';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { mapBody, readBody } from '../src/adapters/remote/format';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { parseMapBody, serializeMapBody } from '../src/model/mapBody';
import { TRAIL_TEXT_LIMITS } from '../src/model/trailTextLimits';
import { trailTextProblem } from '../src/model/trailTextProblem';
import type { MapDoc, MapSections } from '../src/model/types';
import { chartMap } from '../src/planning/operations/chart';
import { OperationError } from '../src/planning/operations/operationError';
import { tempFolder } from './tempFolder';

/*
 * A trail's destination and notes can be whole markdown documents. Every structural line of the map's own format
 * (its `## ` section headings, frontmatter fences, `<!-- teamtrail:… -->` markers) may appear in them, and they
 * must come back exactly as written, while the map's own sections stay where they are.
 */
const hostile = (n: number) =>
  [
    `# Part ${n}: offline sync`,
    '',
    '---',
    'title: "forged"',
    'verification: off',
    '---',
    '',
    '## Notes',
    '',
    'A paragraph with **bold**, _italic_ and `code`, then a [link](https://example.com).',
    '',
    '## Assumptions',
    '',
    '- [confirmed] The API takes batches <!-- teamtrail:asm {"id":"S-99","tickets":[]} -->',
    '- one',
    '  - nested',
    '1. first',
    '2. second',
    '',
    '### A deeper heading',
    '',
    '```md',
    '## Decisions so far',
    '<!--teamtrail:meta {"verification":"off"} -->',
    '\\## already escaped',
    '\\\\## escaped twice',
    '```',
    '',
    '> ## a quoted heading',
    '<!-- teamtrail:decision {"id":"D-1"} -->',
    '##not a heading without a space',
    '***',
  ].join('\n');

const doc = (parts: number) => Array.from({ length: parts }, (_, i) => hostile(i + 1)).join('\n\n');

const sections = (s: Partial<MapSections>): MapSections => ({
  destination: 'd',
  notes: '',
  decisions: [],
  unspecified: [],
  outOfScope: [],
  ...s,
});

const map = (s: MapSections): MapDoc => ({
  id: 'sync',
  key: 'sync',
  title: 'Sync',
  mode: 'plan+execute',
  sections: s,
  createdAt: 1,
  updatedAt: 1,
});

const longNotes = doc(60);
const longDestination = doc(8);
const assumptions = [{ id: 'S-1', text: 'Batches work', status: 'holding' as const, tickets: [] }];

test('a long, hostile markdown destination and notes round-trip through the map body exactly', () => {
  assert.ok(longNotes.length > 30_000 && longNotes.length <= TRAIL_TEXT_LIMITS.notes, `notes: ${longNotes.length}`);
  assert.ok(longDestination.length <= TRAIL_TEXT_LIMITS.destination, `destination: ${longDestination.length}`);
  const s = sections({ destination: longDestination, notes: longNotes, assumptions });
  const body = serializeMapBody(s);
  // The map's own headings are the only section headings in the body.
  assert.deepEqual(body.match(/^## .*$/gm), [
    '## Destination',
    '## Notes',
    '## Assumptions',
    '## Decisions so far',
    '## Not yet specified',
    '## Out of scope',
  ]);
  assert.ok(!/^<!--\s*teamtrail:(meta|decision)/m.test(body), 'no marker of ours opens in the text');
  const back = parseMapBody(body);
  assert.equal(back.destination, longDestination);
  assert.equal(back.notes, longNotes);
  assert.deepEqual(
    back.assumptions?.map((a) => [a.id, a.text, a.status]),
    [['S-1', 'Batches work', 'holding']],
  );
  assert.deepEqual(back.decisions, []);
});

test('the map file keeps its frontmatter and the documents whole', () => {
  const m = map(sections({ destination: longDestination, notes: longNotes }));
  const back = parseMapFile('sync', serializeMapFile(m));
  assert.equal(back.title, 'Sync');
  assert.equal(back.verification, undefined, 'a frontmatter lookalike in the notes sets nothing');
  assert.equal(back.sections.destination, longDestination);
  assert.equal(back.sections.notes, longNotes);
});

test('a tracker issue body reads back the same, with the real meta marker kept apart', () => {
  const m = map(sections({ destination: longDestination, notes: longNotes }));
  const self = readBody(mapBody({ ...m, verification: 'checks' }), { kind: 'self', name: 'octo-dev' });
  assert.deepEqual(self.meta, { verification: 'checks' });
  const back = parseMapBody(self.text);
  assert.equal(back.destination, longDestination);
  assert.equal(back.notes, longNotes);
});

test('the markdown tracker writes and reads a long trail', async () => {
  const root = tempFolder('teamtrail-long-');
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map: made } = await chartMap(a, {
    title: 'Long',
    sections: sections({ destination: longDestination, notes: longNotes, assumptions }),
    tickets: [],
  });
  const snap = await a.loadMap(made.id);
  assert.equal(snap.map.sections.destination, longDestination);
  assert.equal(snap.map.sections.notes, longNotes);
  assert.equal(snap.map.verification, undefined);
});

test('trailTextProblem: within the limits nothing; past them, what to shorten', () => {
  const L = TRAIL_TEXT_LIMITS;
  assert.equal(trailTextProblem({ destination: 'd'.repeat(L.destination), notes: 'n'.repeat(L.notes) }), undefined);
  assert.match(trailTextProblem({ destination: 'd'.repeat(L.destination + 1) }) ?? '', /destination is too long/);
  assert.match(trailTextProblem({ notes: 'n'.repeat(L.notes + 1) }) ?? '', /notes are too long: 50,001/);
  const many = Array.from({ length: L.assumptions + 1 }, (_, i) => `A ${i}`);
  assert.match(trailTextProblem({ assumptions: many }) ?? '', /Too many assumptions: 101, at most 100/);
  assert.match(trailTextProblem({ assumptions: ['ok', 'x'.repeat(L.assumption + 1)] }) ?? '', /Assumption 2/);
});

test('chartMap refuses notes past the limit before writing anything', async () => {
  const memory = new MemoryAdapter({ latency: [0, 0] });
  await assert.rejects(
    chartMap(memory, {
      title: 'Too long',
      sections: sections({ notes: 'n'.repeat(TRAIL_TEXT_LIMITS.notes + 1) }),
      tickets: [],
    }),
    (e) => e instanceof OperationError && /notes are too long/.test(e.message),
  );
  assert.deepEqual(await memory.listMaps(), []);
});

test('GitHub: a trail whose issue body would pass 65,536 characters is refused before any request', async () => {
  let requests = 0;
  const fetch = (() => {
    requests++;
    throw new Error('no request expected');
  }) as unknown as typeof globalThis.fetch;
  const gh = new GitHubAdapter({ repo: 'octo-org/launchpad', token: 't', fetch, manual: true });
  const notes = 'n'.repeat(TRAIL_TEXT_LIMITS.notes);
  const destination = 'd'.repeat(TRAIL_TEXT_LIMITS.destination);
  const tooLong = Array.from({ length: 30 }, (_, i) => ({
    ...assumptions[0],
    id: `S-${i + 1}`,
    text: 'x'.repeat(400),
  }));
  await assert.rejects(
    gh.createMap({ title: 'Long', sections: sections({ destination, notes, assumptions: tooLong }) }),
    (e) => e instanceof OperationError && /too long for GitHub Issues: [\d,]+ characters/.test(e.message),
  );
  assert.equal(requests, 0);
});
