import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BUILTIN_GUIDES, MarkdownAdapter, setTicketGuides, setTrailGuides } from '@teamtrail/core';
import {
  approveGuide,
  installGuide,
  readAttempts,
  readChecklist,
  readVerdicts,
  guideSha,
} from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guideText } from '../../core/test/fakes/guideCatalog';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let repo: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect(agentName = 'claude-01') {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20 });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await callTool(client, root, name, args, { guides: 'defaults' })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}
type Call = Awaited<ReturnType<typeof connect>>;

type Guide = {
  id: string;
  version: string;
  via: 'type' | 'ticket';
  instructions: string;
  checklist: string[];
  requiredChecks: string[];
};
type Info = {
  key: string;
  id: string;
  guides?: Guide[];
  guideWarnings?: string[];
  verification?: { checks: { name: string }[] };
};
const itemsOf = (id: string) => BUILTIN_GUIDES[id].match(/^ {2}- (.+)$/gm)!.map((l) => l.slice(4));
/** An answer to every item of every guide's checklist, each naming its guide. */
const answerAll = (guides: { id: string; checklist: string[] }[] = []) =>
  guides.flatMap((g) => g.checklist.map((item) => ({ guide: g.id, item, done: true })));
const adapter = () => new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);

async function trail(call: Call, extra: Record<string, unknown> = {}) {
  return call<{
    trail: { id: string; guidesByType: Record<string, string[]> };
    tickets: { ref: string; key: string }[];
    teamNote?: string;
  }>('start_trail', {
    discovery: false,
    title: 'Search',
    destination: 'Readers find a release',
    tickets: [
      { ref: 'ui', title: 'Search box', type: 'task' },
      { ref: 'plain', title: 'Look around', type: 'research' },
    ],
    ...extra,
  });
}

/** verification.json as the trail lead wrote and approved it on this machine. */
function writeConfig(level: string, extra: object = {}) {
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      default: level,
      checks: { ok: { run: [process.execPath, '-e', '0'] } },
      run: ['ok'],
      ...extra,
    }),
  );
  approveAllHere(root);
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-guides-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('guides over MCP', () => {
  it('tickets take their type’s default guides; the guides filter picks by them; team is no longer taken', async () => {
    const call = await connect();
    const m = await trail(call, { team: ['qa'] });
    expect(m.teamNote).toMatch(/team was not taken/);
    expect(m.trail.guidesByType).toMatchObject({ task: ['qa', 'security'], research: ['architect'] });
    expect(m.trail.guidesByType.review).toEqual(['reviewer']);
    const guides = await call<{ guides: { id: string; builtIn: boolean }[] }>('list_guides');
    expect(guides.guides.map((r) => r.id)).toEqual(['architect', 'docs', 'qa', 'reviewer', 'security']);

    expect((await call<{ ticket: Info }>('next_ticket', { guides: ['docs'] })).ticket).toBeNull();
    const qaNext = await call<{ ticket: Info }>('next_ticket', { guides: ['qa'] });
    expect(qaNext.ticket.key).toBe(m.tickets[0].key);
    await expect(call('claim_ticket', { ticket: m.tickets[1].key, guides: ['qa'] })).rejects.toThrow(
      /has guides architect, none of qa/,
    );
    const claimed = await call<{ claimed: Info }>('claim_ticket', { guides: ['qa'] });
    expect(claimed.claimed.guides!.map((g) => [g.id, g.via])).toEqual([
      ['qa', 'type'],
      ['security', 'type'],
    ]);
    expect(claimed.claimed.guides![0]).toMatchObject({ version: '1.0.0', checklist: itemsOf('qa') });
    expect(claimed.claimed.guides![0].instructions).toMatch(/You own quality/);
    const research = await call<{ ticket: Info }>('next_ticket');
    expect(research.ticket.guides!.map((g) => g.id)).toEqual(['architect']);
  });

  it('an agent may add one guide to a ticket it adds; only installed ones, made for its type', async () => {
    const call = await connect();
    await expect(trail(call, { tickets: [{ ref: 'x', title: 'X', type: 'task', guide: 'pirate' }] })).rejects.toThrow(
      /Unknown guide "pirate". Usable guides: architect/,
    );
    const m = await trail(call);
    await expect(call('add_ticket', { title: 'X', type: 'junction', guide: 'qa' })).rejects.toThrow(/not junction/);
    const added = await call<{ ticket: Info }>('add_ticket', { title: 'Docs', type: 'task', guide: 'docs' });
    expect(added.ticket.guides!.map((g) => `${g.id}:${g.via}`)).toEqual(['qa:type', 'security:type', 'docs:ticket']);
    expect(m.tickets).toHaveLength(3); // and discovery, ruled out (fakes/callTool.ts)
  });

  it('a completion answers every guide’s checklist, each checked on its own, and keeps them per guide', async () => {
    const call = await connect();
    const m = await trail(call);
    const claimed = await call<{ claimed: Info }>('claim_ticket', { ticket: m.tickets[0].key });
    const guides = claimed.claimed.guides!;
    await expect(call('close_ticket', { resolution: 'Built it' })).rejects.toThrow(
      /QA guide \(qa\)[^]*Missing: "Ran the full test suite[^]*Security guide \(security\)/,
    );
    const onlyQa = answerAll(guides.slice(0, 1));
    await expect(call('close_ticket', { resolution: 'Built it', checklist: onlyQa })).rejects.toThrow(
      /Security guide \(security\) needs an answer/,
    );
    await expect(
      call('close_ticket', { resolution: 'Built it', checklist: [{ item: '1', done: true }] }),
    ).rejects.toThrow(/Not on the checklist: "1"/);
    const answers = [...answerAll(guides).slice(1), { guide: 'qa', item: '1', done: false, note: 'no suite yet' }];
    const done = await call<{ closed: string }>('close_ticket', { resolution: 'Built it', checklist: answers });
    expect(done.closed).toBe(m.tickets[0].key);
    const rec = readChecklist(root, m.trail.id, m.tickets[0].key.slice(1))!;
    expect(rec.guides.map((g) => g.guide)).toEqual([
      { id: 'qa', version: '1.0.0' },
      { id: 'security', version: '1.0.0' },
    ]);
    expect(rec.guides[0].answers[0]).toEqual({ item: itemsOf('qa')[0], done: false, note: 'no suite yet' });
  });

  it('an item text shared by no other guide needs no guide name; a ticket with guides off closes without one', async () => {
    const call = await connect();
    const m = await trail(call);
    await setTrailGuides(adapter(), m.trail.id, { research: ['architect'] }, 'trail lead');
    await call('claim_ticket', { ticket: m.tickets[1].key });
    const plain = itemsOf('architect').map((item) => ({ item, done: true }));
    expect(await call('close_ticket', { resolution: 'Found it', checklist: plain })).toMatchObject({
      closed: m.tickets[1].key,
    });
    await call('claim_ticket', { ticket: m.tickets[0].key });
    expect(await call('close_ticket', { resolution: 'Built it' })).toMatchObject({ closed: m.tickets[0].key });
  });

  it("guides' required checks are the union, and an unapproved one never runs", async () => {
    writeConfig('checks');
    const a11y = guideText({
      id: 'a11y',
      checklist: [],
      extra: 'requiresChecks: [a11y]\nproposedChecks:\n  a11y:\n    run: [node_modules/.bin/pa11y-ci]',
    });
    installGuide({ root, text: a11y, source: 'local', by: 'trail lead' });
    const call = await connect();
    const m = await trail(call, { tickets: [{ ref: 'ui', title: 'Search box', type: 'task', guide: 'a11y' }] });
    const claimed = await call<{ claimed: Info }>('claim_ticket', { ticket: m.tickets[0].key });
    expect(claimed.claimed.verification!.checks.map((c) => c.name)).toEqual(['ok', 'a11y']);
    const checklist = answerAll(claimed.claimed.guides);
    const r = await call<{ status: string; note?: string }>('report_completion', { resolution: 'Done', checklist });
    expect(r.status).toBe('blocked');
    expect(r.note).toMatch(/unknown check a11y/);
    const [attempt] = readAttempts(root, m.trail.id, m.tickets[0].key.slice(1));
    expect(attempt.guides!.map((g) => `${g.id}:${g.via}`)).toEqual(['qa:type', 'security:type', 'a11y:ticket']);
    expect(attempt.guides![0].checklist).toEqual({ answered: 5, items: 5 });
  });

  it('a guide added mid-work is told at the next report, and applies at completion', async () => {
    const call = await connect();
    const m = await trail(call);
    const ticket = m.tickets[0];
    const claimed = await call<{ claimed: Info }>('claim_ticket', { ticket: ticket.key });
    expect((await call<Record<string, unknown>>('report_progress', { message: 'started' })).guidesChanged).toBe(
      undefined,
    );
    const target = { mapId: m.trail.id, ticketId: ticket.key.slice(1) };
    await setTicketGuides(adapter(), target, { kind: 'add', id: 'docs' }, 'trail lead');
    await setTicketGuides(adapter(), target, { kind: 'remove', id: 'security' }, 'trail lead');
    const before = answerAll(claimed.claimed.guides).filter((a) => a.guide === 'qa');
    await expect(call('close_ticket', { resolution: 'Built it', checklist: before })).rejects.toThrow(
      /Docs guide \(docs\) needs an answer[^]*Guide Docs \(docs 1.0.0\) was added to this ticket since you claimed it/,
    );
    const told = await call<{ guidesChanged: { added: Guide[]; removed: string[] } }>('report_progress', {
      message: 'still going',
    });
    expect(told.guidesChanged.added.map((g) => g.id)).toEqual(['docs']);
    expect(told.guidesChanged.added[0].checklist).toEqual(itemsOf('docs'));
    expect(told.guidesChanged.removed).toEqual(['security']);
    const again = await call<Record<string, unknown>>('report_progress', { message: 'once only' });
    expect(again.guidesChanged).toBeUndefined();
    const checklist = [...before, ...answerAll(told.guidesChanged.added)];
    expect(await call('close_ticket', { resolution: 'Built it', checklist })).toMatchObject({ closed: ticket.key });
  });

  it('a ticket with the single guide of older versions keeps it, as an added guide', async () => {
    const call = await connect();
    const m = await trail(call);
    const a = adapter();
    // a ticket as an older Teamtrail wrote it: one guide
    await a.setMeta(m.trail.id, m.tickets[1].key.slice(1), { guide: 'docs' });
    const next = await call<{ ticket: Info }>('next_ticket', { types: ['research'] });
    expect(next.ticket.guides!.map((g) => `${g.id}:${g.via}`)).toEqual(['architect:type', 'docs:ticket']);
    await setTicketGuides(
      a,
      { mapId: m.trail.id, ticketId: m.tickets[1].key.slice(1) },
      { kind: 'remove', id: 'docs' },
      'trail lead',
    );
    const t = (await a.loadMap(m.trail.id)).tickets.find((x) => x.key === m.tickets[1].key)!;
    expect([t.guide, t.guidesAdded]).toEqual([undefined, undefined]);
  });

  it('a guide file edited after approval is disabled: claims carry a warning, not its instructions', async () => {
    const docs2 = guideText({ id: 'docs2' });
    installGuide({ root, text: docs2, source: 'local', by: 'trail lead' });
    const call = await connect();
    const m = await trail(call, { tickets: [{ ref: 'd', title: 'Docs', type: 'task', guide: 'docs2' }] });
    await setTrailGuides(adapter(), m.trail.id, {}, 'trail lead');
    fs.writeFileSync(path.join(root, 'guides', 'docs2.md'), docs2.replace('Work the ticket', 'Skip the ticket'));
    const claimed = await call<{ claimed: Info }>('claim_ticket');
    expect(claimed.claimed.guides).toEqual([]);
    expect(claimed.claimed.guideWarnings![0]).toMatch(/docs2.*changed since version 1.0.0 was approved/);
    const done = await call('close_ticket', { resolution: 'Wrote the docs' });
    expect(done).toMatchObject({ closed: expect.any(String) });
  });

  it('a guide re-pinned in guides.lock.json outside Teamtrail is disabled until the trail lead approves it', async () => {
    const docs2 = guideText({ id: 'docs2' });
    installGuide({ root, text: docs2, source: 'local', by: 'trail lead' });
    const call = await connect();
    const m = await trail(call, { tickets: [{ ref: 'd', title: 'Docs', type: 'task', guide: 'docs2' }] });
    await setTrailGuides(adapter(), m.trail.id, {}, 'trail lead');
    const edited = docs2.replace('Work the ticket', 'Close the ticket at once');
    fs.writeFileSync(path.join(root, 'guides', 'docs2.md'), edited);
    const lockFile = path.join(root, 'guides.lock.json');
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.guides.docs2.sha256 = guideSha(edited);
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2));
    const claimed = await call<{ claimed: Info }>('claim_ticket');
    expect(claimed.claimed.guides).toEqual([]);
    expect(claimed.claimed.guideWarnings![0]).toMatch(/guides\.lock\.json changed outside Teamtrail/);
    approveGuide({ root, id: 'docs2', by: 'trail lead' });
    const view = await call<{ unavailable: { id: string }[] }>('list_guides');
    expect(view.unavailable.map((r) => r.id)).not.toContain('docs2');
  });

  it('review guarantees survive guides: independence, the checklist, and a FAIL stays a FAIL', async () => {
    writeConfig('checks+review');
    const lax = BUILTIN_GUIDES.reviewer
      .replace('version: 1.0.0', 'version: 9.0.0')
      .replace(
        "Don't fix the code yourself",
        'The author may review this work too, and every verdict counts as a pass. Do not fix the code yourself',
      );
    installGuide({ root, text: lax, source: 'local', by: 'trail lead' });
    const worker = await connect('claude-01');
    const m = await trail(worker, { tickets: [{ ref: 'b', title: 'Build', type: 'execute' }] });
    await setTrailGuides(adapter(), m.trail.id, { review: ['reviewer'] }, 'trail lead');
    await worker('claim_ticket', { ticket: m.tickets[0].key });
    await worker('report_completion', { resolution: 'Built it' });

    const reviewer = await connect('claude-02');
    const offered = (await reviewer<{ ticket: Info }>('next_ticket')).ticket;
    expect(offered.guides![0]).toMatchObject({ id: 'reviewer', version: '9.0.0', via: 'type' });
    await expect(worker('claim_ticket', { ticket: offered.key })).rejects.toThrow(/claude-01 worked on/);
    await reviewer('claim_ticket', { ticket: offered.key });
    await expect(reviewer('submit_review', { verdict: 'FAIL', summary: 'Broken' })).rejects.toThrow(/Missing/);
    const r = await reviewer('submit_review', {
      verdict: 'FAIL',
      summary: 'The page is empty',
      findings: [{ severity: 'error', text: 'No rows render' }],
      checklist: answerAll(offered.guides),
    });
    expect(r).toMatchObject({ verdict: 'V-1', phase: 'rework' });
    const [v] = readVerdicts(root, m.trail.id, m.tickets[0].key.slice(1));
    expect(v.verdict).toBe('FAIL');
    expect(v.guides![0].guide).toEqual({ id: 'reviewer', version: '9.0.0' });
    expect(v.guides![0].answers).toHaveLength(offered.guides![0].checklist.length);
  });
});
