import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lanCallRefusal } from '../src/server/lanCallRefusal';
import { lanFileRefusal } from '../src/server/lanFileRefusal';
import { LAN_TICKET_CHANGES, LAN_TICKET_FIELDS } from '../src/server/trustFields';

/*
 * GitHub and Linear calls from a device on the network get the same limits as the markdown file route: it reads,
 * edits text and moves a ticket along (state, status, close); everything else is this machine's.
 */

test('a LAN device’s tracker calls: refused for type, hitl, blockers, assignee, mode, destination, guides, decisions, new items', () => {
  for (const [method, args] of [
    ['createMap', [{ title: 'x', sections: {} }]],
    ['createTicket', ['m', { title: 'x', type: 'task', body: '' }]],
    ['setMapMode', ['m', 'plan-only']],
    ['setMapMeta', ['m', { guides: ['qa'] }]],
    ['setMapMeta', ['m', { verification: 'off' }]],
    ['updateMapSections', ['m', { destination: 'Elsewhere' }]],
    ['updateMapSections', ['m', { assumptions: [] }]],
    ['addBlocking', ['m', '1', '2']],
    ['removeBlocking', ['m', '1', '2']],
    ['assign', ['m', '1', 'claude-07']],
    ['assign', ['m', '1', null]],
    ['setMeta', ['m', '1', { status: 'claimed', verification: 'off' }]],
    ['setMeta', ['m', '1', { guide: 'qa' }]],
    ['setMeta', ['m', '1', { status: 'claimed', confirm: true }]],
    ['createDecision', ['m', { decidedBy: 'trail lead' }]],
    ['markSuperseded', ['m', 'D-1', 'D-2']],
    ['somethingNew', []],
  ] as const)
    assert.ok(lanCallRefusal(method, [...args]), `${method} ${JSON.stringify(args)}`);
});

test('a LAN device’s tracker calls: reads, text, and a ticket’s state, status and close go through', () => {
  for (const [method, args] of [
    ['listMaps', []],
    ['loadMap', ['m']],
    ['listDecisions', ['m']],
    ['comment', ['m', '1', 'trail lead', 'hi']],
    ['editTicket', ['m', '1', { title: 'x' }]],
    ['updateMapSections', ['m', { notes: 'from the phone' }]],
    ['close', ['m', '1', 'completed']],
    ['reopen', ['m', '1']],
    ['setMeta', ['m', '1', { status: 'claimed' }]],
  ] as const)
    assert.equal(lanCallRefusal(method, [...args]), undefined, `${method} ${JSON.stringify(args)}`);
});

test('the file route and tracker calls share one definition of what a LAN device may change', () => {
  assert.deepEqual(LAN_TICKET_FIELDS, Object.keys(LAN_TICKET_CHANGES));
  const calls = new Set(Object.values(LAN_TICKET_CHANGES).flatMap((c) => c.calls));
  assert.deepEqual([...calls].sort(), ['close', 'reopen', 'setMeta']);
  // and the file route checks exactly those fields: a status change passes, a type change doesn't
  const ticket = (extra: string) =>
    `---\nid: "1"\nformat: "2"\ntitle: T\ntype: task\nlabels: [teamtrail:task]\nstate: open\n${extra}---\n\nbody\n`;
  assert.equal(lanFileRefusal('t/tickets/1.md', ticket(''), ticket('status: claimed\n')), undefined);
  assert.ok(lanFileRefusal('t/tickets/1.md', ticket(''), ticket('').replace(/type: task/, 'type: junction')));
});
