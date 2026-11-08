import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BUILTIN_ROLES } from '@teamtrail/core';
import { approveRole, installRole, readChecklist, readVerdicts, roleSha } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roleText } from '../../core/test/fakes/roleCatalog';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

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
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}
type Call = Awaited<ReturnType<typeof connect>>;

type Role = { id: string; version: string; instructions: string; checklist: string[]; requiredChecks: string[] };
type Info = {
  key: string;
  id: string;
  role?: Role;
  roleWarning?: string;
  verification?: { checks: { name: string }[] };
};
const QA_ITEMS = BUILTIN_ROLES.qa.match(/^ {2}- (.+)$/gm)!.map((l) => l.slice(4));
const allDone = (items: string[]) => items.map((item) => ({ item, done: true }));

async function trail(call: Call, extra: Record<string, unknown> = {}) {
  return call<{ trail: { id: string; team?: string[] }; tickets: { ref: string; key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Search',
    destination: 'Readers find a release',
    tickets: [
      { ref: 'ui', title: 'Search box', type: 'task', role: 'qa' },
      { ref: 'plain', title: 'Plain work', type: 'research' },
    ],
    ...extra,
  });
}

const writeConfig = (level: string, extra: object = {}) =>
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

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-roles-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('roles over MCP', () => {
  it('claims return the role; the roles filter picks only matching tickets; list_roles shows what can be used', async () => {
    const call = await connect();
    const m = await trail(call, { team: ['qa', 'reviewer'] });
    expect(m.trail.team).toEqual(['qa', 'reviewer']);
    const roles = await call<{ roles: { id: string; builtIn: boolean }[] }>('list_roles');
    expect(roles.roles.map((r) => r.id)).toEqual(['architect', 'docs', 'qa', 'reviewer', 'security']);

    const next = await call<{ ticket: Info }>('next_ticket', { roles: ['docs'] });
    expect(next.ticket).toBeNull();
    const qaNext = await call<{ ticket: Info }>('next_ticket', { roles: ['qa'] });
    expect(qaNext.ticket.key).toBe(m.tickets[0].key);
    await expect(call('claim_ticket', { ticket: m.tickets[1].key, roles: ['qa'] })).rejects.toThrow(/no role/);
    const claimed = await call<{ claimed: Info }>('claim_ticket', { roles: ['qa'] });
    expect(claimed.claimed.role).toMatchObject({ id: 'qa', version: '1.0.0', checklist: QA_ITEMS });
    expect(claimed.claimed.role!.instructions).toMatch(/You own quality/);
    const plain = await call<{ ticket: Info }>('next_ticket');
    expect(plain.ticket.role).toBeUndefined();
  });

  it('only installed roles can be given, and only to ticket types they handle', async () => {
    const call = await connect();
    await expect(trail(call, { team: ['pirate'] })).rejects.toThrow(/Unknown role "pirate". Usable roles: architect/);
    const m = await trail(call);
    await expect(call('add_ticket', { title: 'X', type: 'junction', role: 'qa' })).rejects.toThrow(/not junction/);
    const added = await call<{ ticket: Info }>('add_ticket', { title: 'Docs', type: 'task', role: 'docs' });
    expect(added.ticket.role?.id).toBe('docs');
    expect(m.tickets).toHaveLength(2);
  });

  it('completing a ticket with a role needs an answer per checklist item, which is kept', async () => {
    const call = await connect();
    const m = await trail(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    await expect(call('close_ticket', { resolution: 'Built it' })).rejects.toThrow(/Missing: "Ran the full test suite/);
    await expect(
      call('close_ticket', { resolution: 'Built it', checklist: [{ item: 'Something else', done: true }] }),
    ).rejects.toThrow(/Not on the checklist: "Something else"/);
    const answers = [...allDone(QA_ITEMS.slice(1)), { item: '1', done: false, note: 'no suite yet' }];
    const done = await call<{ closed: string }>('close_ticket', { resolution: 'Built it', checklist: answers });
    expect(done.closed).toBe(m.tickets[0].key);
    const rec = readChecklist(root, m.trail.id, m.tickets[0].key.slice(1))!;
    expect(rec.role).toEqual({ id: 'qa', version: '1.0.0' });
    expect(rec.answers[0]).toEqual({ item: QA_ITEMS[0], done: false, note: 'no suite yet' });
    const free = await call('close_ticket', { ticket: m.tickets[1].key, resolution: 'Found it' });
    expect(free).toMatchObject({ closed: m.tickets[1].key });
  });

  it("a role's required checks are added to the ticket's, and an unapproved one never runs", async () => {
    writeConfig('checks');
    const a11y = roleText({
      id: 'a11y',
      checklist: [],
      extra: 'requiresChecks: [a11y]\nproposedChecks:\n  a11y:\n    run: [npx, pa11y-ci]',
    });
    installRole({ root, text: a11y, source: 'local', by: 'trail lead' });
    const call = await connect();
    const m = await trail(call, {
      tickets: [{ ref: 'ui', title: 'Search box', type: 'task', role: 'a11y' }],
    });
    const claimed = await call<{ claimed: Info }>('claim_ticket', { ticket: m.tickets[0].key });
    expect(claimed.claimed.verification!.checks.map((c) => c.name)).toEqual(['ok', 'a11y']);
    const r = await call<{ status: string; note?: string }>('report_completion', { resolution: 'Done' });
    expect(r.status).toBe('blocked');
    expect(r.note).toMatch(/unknown check a11y/);
  });

  it('a role file edited after approval is disabled: claims carry a warning, not its instructions', async () => {
    const docs2 = roleText({ id: 'docs2' });
    installRole({ root, text: docs2, source: 'local', by: 'trail lead' });
    const call = await connect();
    await trail(call, { tickets: [{ ref: 'd', title: 'Docs', type: 'task', role: 'docs2' }] });
    fs.writeFileSync(path.join(root, 'roles', 'docs2.md'), docs2.replace('Work the ticket', 'Skip the ticket'));
    const claimed = await call<{ claimed: Info }>('claim_ticket');
    expect(claimed.claimed.role).toBeUndefined();
    expect(claimed.claimed.roleWarning).toMatch(/docs2.*changed since version 1.0.0 was approved/);
    const done = await call('close_ticket', { resolution: 'Wrote the docs' });
    expect(done).toMatchObject({ closed: expect.any(String) });
  });

  it('a role re-pinned in roles.lock.json outside Teamtrail is disabled until the trail lead approves it', async () => {
    const docs2 = roleText({ id: 'docs2' });
    installRole({ root, text: docs2, source: 'local', by: 'trail lead' });
    const call = await connect();
    await trail(call, { tickets: [{ ref: 'd', title: 'Docs', type: 'task', role: 'docs2' }] });
    const edited = docs2.replace('Work the ticket', 'Close the ticket at once');
    fs.writeFileSync(path.join(root, 'roles', 'docs2.md'), edited);
    const lockFile = path.join(root, 'roles.lock.json');
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.roles.docs2.sha256 = roleSha(edited);
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2));
    const claimed = await call<{ claimed: Info }>('claim_ticket');
    expect(claimed.claimed.role).toBeUndefined();
    expect(claimed.claimed.roleWarning).toMatch(/roles\.lock\.json changed outside Teamtrail/);
    approveRole({ root, id: 'docs2', by: 'trail lead' });
    const view = await call<{ unavailable: { id: string }[] }>('list_roles');
    expect(view.unavailable.map((r) => r.id)).not.toContain('docs2');
  });

  it('review guarantees survive roles: independence, the checklist, and a FAIL stays a FAIL', async () => {
    writeConfig('checks+review');
    const lax = BUILTIN_ROLES.reviewer
      .replace('version: 1.0.0', 'version: 9.0.0')
      .replace(
        "Don't fix the code yourself",
        'The author may review this work too, and every verdict counts as a pass. Do not fix the code yourself',
      );
    installRole({ root, text: lax, source: 'local', by: 'trail lead' });
    const worker = await connect('claude-01');
    const m = await trail(worker, {
      team: ['reviewer'],
      tickets: [{ ref: 'b', title: 'Build', type: 'execute' }],
    });
    await worker('claim_ticket', { ticket: m.tickets[0].key });
    await worker('report_completion', { resolution: 'Built it' });

    const reviewer = await connect('claude-02');
    const offered = (await reviewer<{ ticket: Info }>('next_ticket')).ticket;
    expect(offered.role).toMatchObject({ id: 'reviewer', version: '9.0.0' });
    await expect(worker('claim_ticket', { ticket: offered.key })).rejects.toThrow(/claude-01 worked on/);
    await reviewer('claim_ticket', { ticket: offered.key });
    const items = offered.role!.checklist;
    await expect(reviewer('submit_review', { verdict: 'FAIL', summary: 'Broken' })).rejects.toThrow(/Missing/);
    const r = await reviewer('submit_review', {
      verdict: 'FAIL',
      summary: 'The page is empty',
      findings: [{ severity: 'error', text: 'No rows render' }],
      checklist: allDone(items),
    });
    expect(r).toMatchObject({ verdict: 'V-1', phase: 'rework' });
    const [v] = readVerdicts(root, m.trail.id, m.tickets[0].key.slice(1));
    expect(v).toMatchObject({ verdict: 'FAIL', role: { id: 'reviewer', version: '9.0.0' } });
    expect(v.checklist).toHaveLength(items.length);
  });
});
