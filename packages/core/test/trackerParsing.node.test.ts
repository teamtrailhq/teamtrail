import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { joinBody, splitBody } from '../src/adapters/remote/format';
import { parseMapBody, serializeMapBody } from '../src/model/mapBody';

/*
 * Tracker bodies are written by anyone who can edit an issue: only the marker Teamtrail writes, where it writes
 * it, is read; parsing takes time in proportion to the text; ids never leave their folder.
 */
const META = (o: object) => `<!-- teamtrail:meta ${JSON.stringify(o)} -->`;

test('a meta marker in the middle of a body is text: it neither wipes the state nor cuts the body', () => {
  const ours = joinBody('Fix the login.', { assignee: 'claude-07', status: 'working', verification: 'checks' });
  const edited = ours.replace('Fix the login.', `Fix the login.\n\n${META({ status: 'done' })}\n\nAnd the logout.`);
  const { text, meta } = splitBody(edited);
  assert.deepEqual(meta, { assignee: 'claude-07', status: 'working', verification: 'checks' });
  assert.match(text, /And the logout\.$/);
});

test('two meta markers: the one at the end counts, the other is text', () => {
  const body = `Body\n\n${META({ assignee: 'mallory' })}\n\n${META({ assignee: 'claude-07' })}`;
  const { text, meta } = splitBody(body);
  assert.deepEqual(meta, { assignee: 'claude-07' });
  assert.equal(text, `Body\n\n${META({ assignee: 'mallory' })}`);
});

test('a marker that is not the last thing in the body is not a marker', () => {
  assert.deepEqual(splitBody(`Body\n\n${META({ assignee: 'x' })}\n\ntrailing words`).meta, {});
});

/** Bodies of the shapes that made the old patterns backtrack: long runs of whitespace or of marker openers. */
const HOSTILE = [
  '\n'.repeat(60_000),
  ' '.repeat(60_000) + 'x',
  '<!-- teamtrail:meta {'.repeat(4_000),
  `${'- [holding] '.repeat(5_000)}<!-- teamtrail:asm {`,
  `## Assumptions\n\n- ${' '.repeat(60_000)}x`,
  `## Assumptions\n\n- [holding] a${' '.repeat(30_000)}<!-- teamtrail:asm {"id":"S-1"} --> x`,
];

test('parsing hostile bodies takes time in proportion to their size', () => {
  for (const body of HOSTILE) {
    const start = performance.now();
    splitBody(body);
    parseMapBody(body);
    parseMapBody(`## Assumptions\n\n${body}`);
    const ms = performance.now() - start;
    assert.ok(ms < 250, `${JSON.stringify(body.slice(0, 30))}… took ${ms.toFixed(0)} ms`);
  }
});

test('assumption lines still read back after the parser change', () => {
  const sections = {
    destination: 'D',
    notes: '',
    decisions: [],
    unspecified: [],
    outOfScope: [],
    assumptions: [
      { id: 'S-2', text: 'The API batches <!-- teamtrail:asm x -->', status: 'challenged' as const, tickets: ['4'] },
    ],
  };
  assert.deepEqual(parseMapBody(serializeMapBody(sections)).assumptions, sections.assumptions);
  assert.deepEqual(parseMapBody('## Assumptions\n\n- hand written').assumptions, [
    { id: 'S-1', text: 'hand written', status: 'holding', tickets: [] },
  ]);
});

test('markdown: ticket and trail ids never reach outside their folder', async () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-ids-')), '.teamtrail');
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const map = await a.createMap({
    title: 'Trail',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
  });
  await a.createTicket(map.id, { title: 'T', type: 'task', body: 'B' });
  // another markdown file of the tracker, read as a ticket through a crafted id
  mkdirSync(path.join(root, 'knowledge'), { recursive: true });
  writeFileSync(path.join(root, 'knowledge', 'K-1.md'), '---\nid: K-1\ntitle: secret\n---\nnot a ticket');
  for (const id of ['../../knowledge/K-1', '../map', '1/../../knowledge/K-1', '.hidden', '']) {
    await assert.rejects(a.editTicket(map.id, id, { title: 'x' }), /not a valid id/, id);
  }
  await assert.rejects(a.loadMap('../knowledge'), /not a valid id/);
  await assert.rejects(a.markSuperseded(map.id, '../../knowledge/K-1', 'D-2'), /not a valid id/);
  assert.equal((await a.loadMap(map.id)).tickets.length, 1);
});
