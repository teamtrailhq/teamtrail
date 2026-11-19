import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { chartMap } from '../src/planning/operations/chart';
import { watchTicketPhases } from '../src/server/watchTicketPhases';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const waitFor = async (ok: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  return ok();
};
const settle = () => new Promise((r) => setTimeout(r, 150));

test('closing, reopening or removing a ticket runs the reconciler soon, once per burst; adding one does not', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-phases-'));
  dirs.push(root);
  // a second adapter on the same folder stands in for an agent's MCP process
  const lookout = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const agent = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(agent, {
    title: 'Phases',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'A', type: 'execute', body: '' },
      { ref: 'b', title: 'B', type: 'execute', body: '' },
    ],
  });
  let kicks = 0;
  const stop = watchTicketPhases({ root, active: async () => lookout }, () => void kicks++, {
    pollMs: 20,
    debounceMs: 40,
  });
  try {
    await settle();
    assert.equal(kicks, 0, 'the first read only sets where things stand');

    await agent.close(map.id, tickets[0].id, 'completed');
    assert.ok(await waitFor(() => kicks === 1), 'done: kicked');

    await agent.reopen(map.id, tickets[0].id);
    await agent.close(map.id, tickets[1].id, 'completed');
    assert.ok(await waitFor(() => kicks === 2), 'a reopen and a close together: one kick');
    await settle();
    assert.equal(kicks, 2);

    await chartMap(agent, {
      title: 'More',
      sections: SECTIONS,
      tickets: [{ ref: 'c', title: 'C', type: 'execute', body: '' }],
    });
    await settle();
    assert.equal(kicks, 2, 'a new ticket changes nothing on a pull request');
  } finally {
    stop();
  }
});
