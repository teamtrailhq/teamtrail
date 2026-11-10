import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MarkdownAdapter } from '@teamtrail/core';
import {
  journalFile,
  listReroutes,
  readAgentDocs,
  readAttempts,
  readCriteria,
  readCriteriaProposals,
  rejectReroute,
  writeAgentAnswer,
  writeTicketCriteria,
} from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agents, type Call } from './fakes/agents';

let repo: string;
let root: string;
const hub = agents(() => root);

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-gates-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  await hub.closeAll();
  fs.rmSync(repo, { recursive: true, force: true });
});

const load = async (mapId: string) => new MarkdownAdapter(nodeMarkdownFs(root), root).loadMap(mapId);
const ticketOf = async (mapId: string, key: string) => (await load(mapId)).tickets.find((t) => t.key === key)!;

/** The human answers the one question waiting, in the Lookout. */
async function answer(text: string) {
  for (;;) {
    const doc = (await readAgentDocs(root)).find((d) => d.pending.length);
    if (doc)
      return writeAgentAnswer(root, {
        sessionId: doc.session.id,
        questionId: doc.pending[0].id,
        text,
        author: 'trail lead',
      });
    await new Promise((r) => setTimeout(r, 20));
  }
}

type Started = { trail: { id: string }; tickets: { ref: string; key: string }[] };
const keyOf = (m: Started, ref: string) => m.tickets.find((t) => t.ref === ref)!.key;

async function chart(call: Call) {
  return call<Started>('start_trail', {
    discovery: false,
    title: 'Exports',
    destination: 'Clients export their data',
    tickets: [
      { ref: 'x', title: 'Build the export', type: 'task' },
      { ref: 'y', title: 'Ship the export', type: 'task', blockedBy: ['x'] },
      { ref: 'z', title: 'Legacy CSV', type: 'task' },
    ],
  });
}

describe('ruling a ticket out is the human’s call (close_ticket out_of_scope)', () => {
  for (const kind of ['local', 'remote'] as const)
    it(`${kind}: an agent never cancels a ticket: ruling out is always a proposal, whatever the human answered`, async () => {
      const lead = await hub.connect({ name: 'claude-01' });
      const m = await chart(lead);
      const call = await hub.connect(kind === 'local' ? { name: 'claude-02' } : { token: 'sandbox' });
      const [x, y, z] = ['x', 'y', 'z'].map((r) => keyOf(m, r));

      // Not claimed: nothing is cancelled, and the blocker still blocks.
      const proposed = await call<{ outcome: string; closed: null }>('close_ticket', {
        ticket: x,
        resolution: 'Nobody exports',
        outcome: 'out_of_scope',
      });
      expect(proposed).toMatchObject({ outcome: 'proposed', closed: null });
      expect((await ticketOf(m.trail.id, x)).state).toBe('open');
      const [r1] = listReroutes(root, m.trail.id);
      expect(r1).toMatchObject({ status: 'pending', changes: [{ op: 'cancel_ticket' }] });
      // The proposal freezes it: nobody claims it meanwhile, and ruling it out again is the same proposal.
      await expect(lead('claim_ticket', { ticket: x })).rejects.toThrow(/frozen by reroute proposal R-1/);
      const again = await lead<{ proposal: { id: string } }>('close_ticket', {
        ticket: x,
        resolution: 'x',
        outcome: 'out_of_scope',
      });
      expect(again.proposal.id).toBe('R-1');

      // Held, but no answer: still only a proposal.
      await call('claim_ticket', { ticket: z });
      const held = await call<{ outcome: string }>('close_ticket', { resolution: 'Drop CSV', outcome: 'out_of_scope' });
      expect(held.outcome).toBe('proposed');
      expect((await ticketOf(m.trail.id, z)).state).toBe('open');
      await call('release_ticket', { ticket: z });

      // Its dependant still waits on it.
      await expect(call('claim_ticket', { ticket: y })).rejects.toThrow(/not on the frontier/);

      // Even an answered question on a held ticket doesn't let the agent cancel it: the answer may say anything,
      // even "don't". Ruling out is always a proposal the human approves in one click.
      const free = await chart(lead);
      const w = keyOf(free, 'z');
      await call('claim_ticket', { trail: free.trail.id, ticket: w });
      const asked = call('ask_human', { question: 'Which date format?', waitSeconds: 30 });
      await answer('ISO 8601. And do NOT drop this ticket.');
      await asked;
      const ruled = await call<{ outcome: string; closed: null }>('close_ticket', {
        trail: free.trail.id,
        resolution: 'Legacy CSV is dropped',
        outcome: 'out_of_scope',
      });
      expect(ruled).toMatchObject({ outcome: 'proposed', closed: null });
      expect(await ticketOf(free.trail.id, w)).toMatchObject({ state: 'open' });
    });
});

describe('rule-out proposals have their own lane; pending proposals never freeze the whole trail', () => {
  async function wide(call: Call, n: number) {
    return call<Started>('start_trail', {
      discovery: false,
      title: 'Plan',
      destination: 'D',
      tickets: Array.from({ length: n }, (_, i) => ({ ref: `t${i}`, title: `Ticket ${i}`, type: 'task' })),
    });
  }
  const cancel = (ticket: string) => ({ op: 'cancel_ticket', ticket, reason: 'not needed' });
  const propose = (call: Call, changes: unknown[]) =>
    call<{ id: string; frozen: string[]; wide?: string }>('propose_reroute', { reason: 'r', evidence: 'e', changes });

  it('a rule-out neither replaces the agent’s own proposal nor waits behind full slots', async () => {
    const a = await hub.connect({ name: 'claude-01' });
    const m = await wide(a, 8);
    const k = m.tickets.map((t) => t.key);
    const mine = await propose(a, [{ op: 'add_unspecified', text: 'own plan' }]);
    for (const name of ['codex-01', 'codex-02'])
      await propose(await hub.connect({ name }), [{ op: 'add_unspecified', text: name }]);
    const out = await a<{ outcome: string; proposal: { id: string } }>('close_ticket', {
      ticket: k[0],
      resolution: 'not needed',
      outcome: 'out_of_scope',
    });
    expect(out.outcome).toBe('proposed');
    const all = listReroutes(root, m.trail.id);
    expect(all.find((p) => p.id === mine.id)?.status).toBe('pending');
    expect(all.filter((p) => p.status === 'pending')).toHaveLength(4);
    // Asking again for the same ticket gives the same proposal, not a new one.
    const again = await a<{ proposal: { id: string } }>('close_ticket', {
      ticket: k[0],
      resolution: 'still not needed',
      outcome: 'out_of_scope',
    });
    expect(again.proposal.id).toBe(out.proposal.id);
  });

  it('wideness counts what every pending proposal freezes, not one at a time', async () => {
    const a = await hub.connect({ name: 'claude-01' });
    const m = await wide(a, 5);
    const k = m.tickets.map((t) => t.key);
    const first = await propose(a, [cancel(k[0]), cancel(k[1])]);
    expect(first.frozen).toHaveLength(2);
    const second = await propose(await hub.connect({ name: 'codex-01' }), [cancel(k[2]), cancel(k[3])]);
    expect(second.frozen).toEqual([]);
    expect(second.wide).toMatch(/freezes nothing/);
    expect(await a('claim_ticket', { ticket: k[2] })).toMatchObject({ claimed: { key: k[2] } });
  });

  it('after the human turns a proposal down, the same agent waits before proposing again', async () => {
    const a = await hub.connect({ name: 'claude-01' });
    const m = await wide(a, 3);
    const p = await propose(a, [{ op: 'add_unspecified', text: 'one' }]);
    await rejectReroute(
      { root, adapter: new MarkdownAdapter(nodeMarkdownFs(root), root), journal: journalFile(root) },
      { mapId: m.trail.id, id: p.id, by: 'trail lead', note: 'No' },
    );
    await expect(propose(a, [{ op: 'add_unspecified', text: 'two' }])).rejects.toThrow(/turned down .* wait/);
  });
});

describe('ruling out never touches a review or a ticket being verified', () => {
  it('refuses them as close_ticket does', async () => {
    fs.writeFileSync(
      path.join(root, 'verification.json'),
      JSON.stringify({
        v: 1,
        default: 'checks+review',
        checks: { c: { run: [process.execPath, '-e', '0'] } },
        run: ['c'],
      }),
    );
    const a = await hub.connect({ name: 'claude-01' });
    const m = await a<Started>('start_trail', {
      discovery: false,
      title: 'R',
      destination: 'D',
      tickets: [{ ref: 'x', title: 'Build', type: 'execute' }],
    });
    const x = keyOf(m, 'x');
    await a('claim_ticket', { ticket: x });
    await a('report_completion', { resolution: 'Built', noCodeReason: 'test' });
    const review = (await load(m.trail.id)).tickets.find((t) => t.type === 'review')!;
    await expect(a('close_ticket', { ticket: x, resolution: 'no', outcome: 'out_of_scope' })).rejects.toThrow(
      /being verified/,
    );
    await expect(a('close_ticket', { ticket: review.key, resolution: 'no', outcome: 'out_of_scope' })).rejects.toThrow(
      /is a review/,
    );
  });
});

describe('agent A vs agent B: nobody changes another agent’s claim', () => {
  const others = [
    { label: 'another local agent', who: { name: 'codex-01' } },
    { label: 'a remote agent', who: { token: 'sandbox' } },
    { label: 'another connection with the same trail name', who: { name: 'claude-01' } },
  ];
  for (const o of others)
    it(`${o.label} cannot release, close, complete, set criteria on, take over or rule out A's claim`, async () => {
      const a = await hub.connect({ name: 'claude-01' });
      const m = await chart(a);
      const x = keyOf(m, 'x');
      await a('claim_ticket', { ticket: x });
      const b = await hub.connect(o.who);
      const refused = /not claimed by you|claimed by claude-01|held by another connection|not yours to take over/;
      await expect(b('release_ticket', { ticket: x })).rejects.toThrow(refused);
      await expect(b('close_ticket', { ticket: x, resolution: 'done' })).rejects.toThrow(refused);
      await expect(b('report_completion', { ticket: x, resolution: 'done', paths: ['a.ts'] })).rejects.toThrow(refused);
      await expect(
        b('set_criteria', { ticket: x, criteria: [{ text: 'Nothing at all', kind: 'unit' }] }),
      ).rejects.toThrow(/not claimed by you|held by another connection/);
      await expect(b('claim_ticket', { ticket: x })).rejects.toThrow(/not on the frontier|not yours to take over/);
      // Ruling it out: a proposal for the human, or (same name, other connection) refused outright.
      await b<{ outcome: string }>('close_ticket', { ticket: x, resolution: 'no', outcome: 'out_of_scope' }).then(
        (r) => expect(r.outcome).toBe('proposed'),
        (e: Error) => expect(e.message).toMatch(/held by another connection|claimed by claude-01/),
      );
      const t = await ticketOf(m.trail.id, x);
      expect(t).toMatchObject({ state: 'open', assignee: 'claude-01' });
      expect(readCriteria(root, m.trail.id)).toEqual([]);
      // A still holds it and finishes it.
      expect(await a('close_ticket', { ticket: x, resolution: 'Built it' })).toMatchObject({ closed: x });
    });
});

describe('acceptance criteria: who writes them, and what counts as proof', () => {
  const config = (level: string) =>
    fs.writeFileSync(
      path.join(root, 'verification.json'),
      JSON.stringify({
        v: 1,
        default: level,
        checks: { check: { run: [process.execPath, '-e', '0'] } },
        run: ['check'],
      }),
    );

  it('the assignee, or the charting agent before anyone claims; confirmed criteria only take a proposal', async () => {
    config('checks');
    const a = await hub.connect({ name: 'claude-01' });
    const m = await a<Started>('start_trail', {
      discovery: false,
      title: 'Exports',
      destination: 'D',
      tickets: [{ ref: 'x', title: 'Build the export', type: 'execute' }],
    });
    const x = keyOf(m, 'x');
    const b = await hub.connect({ name: 'codex-01' });
    const one = [{ text: 'Trivially true', kind: 'unit' }];
    await expect(b('set_criteria', { ticket: x, criteria: one })).rejects.toThrow(/Claim .* first/);
    await a('set_criteria', {
      ticket: x,
      criteria: [
        { text: 'Exports every row', kind: 'unit' },
        { text: 'Only the owner can export', kind: 'security' },
      ],
    });
    // The human confirms them.
    writeTicketCriteria(root, { id: m.trail.id, title: 'Exports' }, { id: x.slice(1), key: x }, { confirmed: true });
    await b('claim_ticket', { ticket: x });
    await expect(a('set_criteria', { ticket: x, criteria: one })).rejects.toThrow(/not claimed by you/);
    const proposal = await b<{ proposed: unknown[]; note: string }>('set_criteria', { ticket: x, criteria: one });
    expect(proposal.note).toMatch(/confirmed ones stay in force/);
    const inForce = readCriteria(root, m.trail.id)[0];
    expect(inForce).toMatchObject({ confirmed: true });
    expect(inForce.criteria.map((c) => c.text)).toEqual(['Exports every row', 'Only the owner can export']);
    expect(readCriteriaProposals(root, m.trail.id)).toHaveLength(1);

    // Completion is checked against the confirmed set: evidence for the proposed AC-1 alone leaves AC-2 missing.
    const short = await b<{ status: string }>('report_completion', {
      resolution: 'Done',
      criteria: [{ id: 'AC-1', evidence: 'command:true' }],
    });
    expect(short.status).toBe('rework');
    await b('claim_ticket', { ticket: x });
    // The agent's word (a command, a test name) is claimed, not verified; on a security criterion the human signs.
    const claimed = await b<{ status: string }>('report_completion', {
      resolution: 'Done',
      criteria: [
        { id: 'AC-1', evidence: 'command:true' },
        { id: 'AC-2', evidence: 'test:owner only' },
      ],
    });
    expect(claimed.status).toBe('verifying');
    const last = readAttempts(root, m.trail.id, x.slice(1)).at(-1)!;
    expect(last.criteria).toMatchObject({ claimed: ['AC-1', 'AC-2'], manual: ['AC-2'], confirmed: true });
    expect(last.criteria!.lines.join('\n')).not.toMatch(/✓/);
    expect(last.criteria!.lines[0]).toMatch(/^AC-1 \? claimed, not verified: command:true/);
  });

  it('at level checks, claimed evidence on an ordinary criterion does not make the ticket wait for a person', async () => {
    config('checks');
    const a = await hub.connect({ name: 'claude-01' });
    const m = await a<Started>('start_trail', {
      discovery: false,
      title: 'Exports',
      destination: 'D',
      tickets: [{ ref: 'x', title: 'Build', type: 'execute', criteria: [{ text: 'Exports rows', kind: 'unit' }] }],
    });
    await a('claim_ticket', { ticket: keyOf(m, 'x') });
    fs.writeFileSync(path.join(repo, 'export.ts'), 'x');
    const done = await a<{ closed?: string; status?: string }>('report_completion', {
      resolution: 'Built',
      criteria: [{ id: 'AC-1', evidence: 'test:exports rows' }],
      noCodeReason: 'test',
    });
    expect(done.closed).toBe(keyOf(m, 'x'));
    const comment = (await ticketOf(m.trail.id, keyOf(m, 'x'))).comments.map((c) => c.body).join('\n');
    expect(comment).toMatch(/AC-1 \? claimed, not verified/);
    expect(comment).toMatch(/rest on claude-01's word/);
  });

  it('the charting agent may still write criteria after it reconnects, and proposals stay out of git', async () => {
    const lead = await hub.connect({ name: 'claude-01' });
    const m = await chart(lead);
    // Locally a trail name is not an identity: a later connection under the same name did not chart the ticket.
    const local = await hub.connect({ name: 'claude-02' });
    const mine = await local<{ ticket: { key: string } }>('add_ticket', {
      trail: m.trail.id,
      title: 'Local',
      type: 'task',
    });
    const sameName = await hub.connect({ name: 'claude-02' });
    await expect(
      sameName('set_criteria', { trail: m.trail.id, ticket: mine.ticket.key, criteria: [{ text: 'x', kind: 'unit' }] }),
    ).rejects.toThrow(/Claim .* first/);
    expect(
      await local('set_criteria', {
        trail: m.trail.id,
        ticket: mine.ticket.key,
        criteria: [{ text: 'x', kind: 'unit' }],
      }),
    ).toBeTruthy();
    for (const who of [{ token: 'sandbox' }, { token: 'sandbox-2' }]) {
      const first = await hub.connect(who);
      const added = await first<{ ticket: { key: string; id: string } }>('add_ticket', {
        trail: m.trail.id,
        title: `Docs for ${JSON.stringify(who)}`,
        type: 'task',
      });
      const k = added.ticket.key;
      const again = await hub.connect(who);
      const saved = await again<{ criteria: unknown[] }>('set_criteria', {
        trail: m.trail.id,
        ticket: k,
        criteria: [{ text: 'Every page listed', kind: 'unit' }],
      });
      expect(saved.criteria).toHaveLength(1);
      const stranger = await hub.connect({ name: 'codex-07' });
      await expect(
        stranger('set_criteria', { trail: m.trail.id, ticket: k, criteria: [{ text: 'x', kind: 'unit' }] }),
      ).rejects.toThrow(/Claim .* first/);
      // Confirmed, a change is a proposal: kept on this machine, not in the committed criteria folder.
      const ticket = { id: k.slice(1), key: k };
      writeTicketCriteria(root, { id: m.trail.id, title: 'Exports' }, ticket, { confirmed: true });
      await again('set_criteria', { trail: m.trail.id, ticket: k, criteria: [{ text: 'Less', kind: 'unit' }] });
    }
    expect(fs.readdirSync(path.join(root, 'criteria')).filter((f) => !f.endsWith('.md'))).toEqual([]);
    expect(readCriteriaProposals(root, m.trail.id)).toHaveLength(2);
    void mine;
    expect(fs.readFileSync(path.join(root, '.agents', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('a criterion source is a knowledge id, nothing else', async () => {
    const a = await hub.connect({ name: 'claude-01' });
    const m = await chart(a);
    await expect(
      a('set_criteria', {
        ticket: keyOf(m, 'x'),
        criteria: [{ text: 'Rows', kind: 'unit', source: '../../etc/passwd' }],
      }),
    ).rejects.toThrow(/knowledge entry id like K-3/);
  });
});
