import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter, setModelMatching, setTrailArchived } from '@teamtrail/core';
import { latestMainRun, localRepoFiles, readReadiness } from '@teamtrail/core/agents';
import { nodeMarkdownFs, startAnyway } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

/*
 * Every tool that suggests work (next_ticket, claim_ticket without a ticket, resume_trail, close_ticket's `next`,
 * start_trail's `next`) offers only what claim_ticket takes, with the same reason when there is nothing: one gate
 * per row, each holding the one ticket a bare "first ready ticket" would offer.
 */

let repo: string;
let root: string;
/** While this file exists, the project's check fails: checks on main fail, a completion's pass. */
let failFlag: string;
const open: { close(): void | Promise<void> }[] = [];
type Call = <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<T>;

async function connect(model?: string): Promise<Call> {
  const usage = { noteCall: () => undefined, measure: () => undefined, model: () => model };
  const agent = new TrailAgent({ root, agent: 'claude-01', pollMs: 20, usage });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async (name, args = {}) => {
    const r = (await callTool(client, root, name, args)) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text);
  };
}

beforeEach(() => {
  repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-offer-')), 'app');
  root = path.join(repo, '.teamtrail');
  failFlag = path.join(path.dirname(repo), 'fail');
  fs.mkdirSync(root, { recursive: true });
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(repo), { recursive: true, force: true });
});

const adapter = () => new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);

/** Verification on, with one check that fails while `failFlag` exists. */
function checks() {
  const run = [process.execPath, '-e', `process.exit(require('fs').existsSync(${JSON.stringify(failFlag)}) ? 1 : 0)`];
  const config = { v: 1, default: 'checks', checks: { test: { run } }, run: ['test'] };
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(config));
  approveAllHere(root);
}

/** A git repo whose check already fails on main. */
function failingMain() {
  fs.writeFileSync(failFlag, '');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  checks();
}

/** A git repo with tests and no check that runs them: repo readiness blocks (no checks), with verification on. */
function notReady() {
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  fs.writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, default: 'checks', checks: {}, run: [] }));
  approveAllHere(root);
}

/** A done ticket whose pull request still waits for review, as the PR reconciler records it. */
function openPr(mapId: string) {
  // Only a ticket that exists counts toward the review queue (liveSyncs), so flag the trail's first ticket file.
  const files = fs.readdirSync(path.join(root, mapId, 'tickets')).filter((f) => f.endsWith('.md'));
  const ticketId = files.sort()[0].replace(/\.md$/, '');
  const dir = path.join(root, '.evidence', mapId, ticketId);
  fs.mkdirSync(dir, { recursive: true });
  const flag = { kind: 'done-pr-open', severity: 'warn', text: 'PR open', since: Date.now() - 60_000 };
  const sync = { v: 1, mapId, ticketId, ticketKey: `#${ticketId}`, provider: 'github', link: {}, checks: [] };
  fs.writeFileSync(path.join(dir, 'sync.json'), JSON.stringify({ ...sync, checksSummary: 'none', flags: [flag] }));
}

type Brief = { key: string } | null;
type Started = { trail: { id: string }; tickets: { ref: string; key: string }[]; next: Brief; nextReason?: string };
type At = { call: Call; mapId: string; key: (ref: string) => string };

interface Gate {
  name: string;
  /** Before the trail is charted. */
  before?: () => void;
  model?: string;
  /** Chart with the discovery step (its research ticket is the one closed). */
  discovery?: boolean;
  /** Criteria on the task, written by the charting agent: they wait for the trail lead. */
  criteria?: boolean;
  /** While the warm-up ticket is claimed, before it is closed. */
  hold?: (at: At) => Promise<void> | void;
  /** The ref offered once the warm-up ticket is closed, or null and why not. */
  offers: string | null;
  reason?: RegExp;
}

const GATES: Gate[] = [
  { name: 'nothing in the way', offers: 'x' },
  { name: 'the discovery brief', discovery: true, offers: null, reason: /call submit_brief/ },
  {
    name: 'the review limit',
    hold: ({ mapId }) => {
      fs.writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1, reviewLimit: 1 }));
      openPr(mapId);
    },
    offers: null,
    reason: /Review limit reached/,
  },
  {
    name: 'checks failing on main',
    before: failingMain,
    hold: () => {
      expect(latestMainRun(root)?.result).toBe('fail');
      fs.rmSync(failFlag); // the warm-up's own checks pass; main's run stays the failing one
    },
    offers: null,
    reason: /already fail on main/,
  },
  {
    name: 'repo readiness',
    before: notReady,
    offers: null,
    reason: /Repo not ready: Teamtrail can't verify work yet: no checks/,
  },
  {
    name: 'a reroute freeze',
    hold: async ({ call, key }) => {
      await call('propose_reroute', {
        reason: 'The task needs a better title',
        evidence: 'review notes',
        changes: [{ op: 'edit_ticket', ticket: key('x'), title: 'Build the export, streamed' }],
      });
    },
    offers: null,
    reason: /No ready ticket/,
  },
  {
    name: 'criteria before work',
    before: checks,
    criteria: true,
    offers: null,
    reason: /confirm its acceptance criteria/,
  },
  {
    name: 'model matching',
    model: 'claude-haiku-4-5',
    hold: ({ mapId }) => setModelMatching(adapter(), mapId, { enabled: true }, 'trail lead'),
    offers: null,
    reason: /set for a stronger model/,
  },
  {
    name: 'an archived trail',
    hold: ({ mapId }) => setTrailArchived(adapter(), mapId, true, 'trail lead'),
    offers: null,
    reason: /archived/,
  },
];

const CRITERIA = [{ text: 'Exports every row', kind: 'unit' }];

async function chart(call: Call, g: Gate) {
  return call<Started>('start_trail', {
    ...(g.discovery ? {} : { discovery: false }),
    title: 'Exports',
    destination: 'Clients export their data',
    tickets: [
      ...(g.discovery ? [] : [{ ref: 'w', title: 'Where does data live?', type: 'research' }]),
      { ref: 'x', title: 'Build the export', type: 'task', ...(g.criteria ? { criteria: CRITERIA } : {}) },
      { ref: 'y', title: 'Ship the export', type: 'task', blockedBy: ['x'] },
      { ref: 'z', title: 'Document the export', type: 'task', blockedBy: ['x'] },
    ],
  });
}

type Next = { ticket: Brief; reason?: string };
type Closed = { closed: string; next: Brief; nextReason?: string };
type Resumed = { next: Brief; nextReason?: string };

describe('every tool that suggests work agrees with claim_ticket', () => {
  it.each(GATES)('$name', async (g) => {
    g.before?.();
    const call = await connect(g.model);
    const m = await chart(call, g);
    const mapId = m.trail.id;
    const key = (ref: string) => m.tickets.find((t) => t.ref === ref)!.key;
    const trail = { trail: mapId };
    expect(m.next?.key).toBe((await call<Next>('next_ticket', trail)).ticket?.key);
    // the warm-up: the discovery ticket, or the research one; the gate comes while it is held
    const warm = await call<{ claimed: { key: string } }>('claim_ticket', {
      ...trail,
      ticket: g.discovery ? m.next!.key : key('w'),
    });
    await g.hold?.({ call, mapId, key });
    const close = await call<Closed>('close_ticket', { ...trail, resolution: 'Found it', noCodeReason: 'research' });
    expect(close.closed).toBe(warm.claimed.key);

    const next = await call<Next>('next_ticket', trail);
    const resume = await call<Resumed>('resume_trail', trail);
    const want = g.offers ? key(g.offers) : null;
    expect(next.ticket?.key ?? null).toBe(want);
    expect(close.next?.key ?? null).toBe(want);
    expect(resume.next?.key ?? null).toBe(want);
    if (want) {
      const claimed = await call<{ claimed: { key: string } }>('claim_ticket', trail);
      expect(claimed.claimed.key).toBe(want);
      return;
    }
    expect(next.reason).toMatch(g.reason!);
    expect(close.nextReason).toBe(next.reason);
    expect(resume.nextReason).toBe(next.reason);
    await expect(call('claim_ticket', trail)).rejects.toThrow(next.reason!);
  });
});

describe('repo readiness', () => {
  it("holds implementation work until the trail lead starts the trail anyway, and a waiting agent wakes on it", async () => {
    notReady();
    const call = await connect();
    const m = await chart(call, { name: 'readiness', offers: null });
    const trail = { trail: m.trail.id };
    const key = (ref: string) => m.tickets.find((t) => t.ref === ref)!.key;
    await call('claim_ticket', { ...trail, ticket: key('w') });
    await call('close_ticket', { ...trail, resolution: 'Found it', noCodeReason: 'research' });
    const held = await call<Next & { readiness?: { waits: string } }>('next_ticket', trail);
    expect(held.ticket).toBeNull();
    expect(held.readiness?.waits).toMatch(/Repo not ready/);
    await expect(call('claim_ticket', { ...trail, ticket: key('x') })).rejects.toThrow(/Repo not ready/);
    const waiting = call<Next & { waited: { woke: string; because?: string } }>('next_ticket', {
      ...trail,
      wait: true,
      waitSeconds: 20,
    });
    await new Promise((r) => setTimeout(r, 300));
    const read = await readReadiness({ root, files: localRepoFiles(repo), probe: true });
    startAnyway({ root, mapId: m.trail.id, readiness: read, by: 'trail lead' });
    const woke = await waiting;
    expect(woke.ticket?.key).toBe(key('x'));
    expect(woke.waited.woke).toBe('work');
    // woken by the change in this machine's store, not the re-check timer (the folder itself may be heard first)
    expect(woke.waited.because).toMatch(/started a trail anyway|approved on this machine/);
  });
});
