import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_MODE, type MapSnapshot, type Ticket } from '../src';
import type { ReadinessFinding, RepoReadiness } from '../src/model/readiness';
import { NEW_REPO_FINDING } from '../src/model/setupTicket';
import { isNewRepo } from '../src/readiness/newRepo';
import { readinessHeld } from '../src/readiness/readinessHeld';
import { repoReadiness } from '../src/readiness/repoReadiness';
import { setupCompletionRefusal } from '../src/readiness/setupCompletionRefusal';
import { setupRefusal } from '../src/readiness/setupRefusal';
import type { ReadinessInput } from '../src/readiness/types';
import { detectRepoProfile, suggestChecks } from '../src/repoProfile';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';

async function readinessOf(files: Record<string, string>, state: ReadinessInput['approval']['state'] = 'none') {
  const repo = memoryRepoFiles(files);
  const profile = await detectRepoProfile(repo);
  const top = (await repo.list!('')) ?? [];
  return repoReadiness({
    profile,
    approval: { state, waiting: state === 'first', hash: 'sha256:base' },
    screening: [],
    suggestions: suggestChecks(profile),
    top: top.map((e) => ({ name: e.name, kind: e.kind })),
    now: 0,
  });
}

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const ids = (r: RepoReadiness) => r.findings.map((f) => f.id);

const ticket = (over: Partial<Ticket>): Ticket => ({
  id: '1',
  key: '#1',
  title: 'T',
  type: 'task',
  body: '',
  state: 'open',
  blockedBy: [],
  comments: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const snapOf = (tickets: Ticket[]): MapSnapshot => ({
  map: { id: 'm', key: '#9', title: 'M', mode: DEFAULT_MAP_MODE, sections: SECTIONS, createdAt: 0, updatedAt: 0 },
  tickets,
});

describe('a new repo', () => {
  it('only documents at the top (readme, licence, docs/, notes for agents, dot files) is new: its own finding', async () => {
    const r = await readinessOf({
      'README.md': '# x',
      LICENSE: 'MIT',
      'docs/idea.md': 'plan',
      'AGENTS.md': 'notes',
      '.gitignore': 'node_modules',
    });
    expect(ids(r)).toEqual([NEW_REPO_FINDING]);
    expect(r.findings[0]).toMatchObject({
      level: 'blocks',
      kind: 'checks',
      text: 'New repo: the first ticket sets it up',
    });
  });

  it('an empty repo is new too', async () => {
    expect(ids(await readinessOf({}))).toEqual([NEW_REPO_FINDING]);
  });

  it('a manifest or any code at the top means a project: no checks is the usual finding', async () => {
    expect(ids(await readinessOf({ 'README.md': '', 'package.json': '{"scripts":{"test":"vitest"}}' }))).toContain(
      'checks-none',
    );
    expect(ids(await readinessOf({ 'README.md': '', 'index.js': 'x' }))).toEqual(['checks-none']);
    expect(ids(await readinessOf({ 'src/main.py': 'x' }))).toEqual(['checks-none']);
  });

  it('checks proposed and not approved yet are their own finding, new repo or not', async () => {
    expect(ids(await readinessOf({ 'README.md': '' }, 'first'))).toEqual(['checks-unapproved']);
  });

  it("isn't decided without the top's listing or when the walk was cut short", async () => {
    const profile = await detectRepoProfile(memoryRepoFiles({ 'README.md': '' }));
    expect(isNewRepo({ profile })).toBe(false);
    expect(isNewRepo({ profile: { ...profile, truncated: true }, top: [{ name: 'README.md', kind: 'file' }] })).toBe(
      false,
    );
    expect(isNewRepo({ profile, top: [{ name: 'README.md', kind: 'file' }] })).toBe(true);
  });
});

describe('the setup ticket', () => {
  const finding = (id: string, kind: ReadinessFinding['kind']): ReadinessFinding => ({
    id,
    kind,
    level: 'blocks',
    text: id,
    why: id,
  });
  const all = () => ['test'];

  it("isn't held by missing or unapproved checks; the rest of the trail is", () => {
    const setup = ticket({ id: '1', setup: true });
    const other = ticket({ id: '2', key: '#2' });
    const snap = snapOf([setup, other]);
    for (const id of [NEW_REPO_FINDING, 'checks-none', 'checks-unapproved']) {
      const held = readinessHeld({ snap, findings: [finding(id, 'checks')], checksOf: all });
      expect(held.map((t) => t.id)).toEqual(['2']);
    }
  });

  it('is held by findings about the machine like any ticket', () => {
    const snap = snapOf([ticket({ setup: true })]);
    const held = readinessHeld({ snap, findings: [finding('program:node', 'program')], checksOf: all });
    expect(held).toHaveLength(1);
  });

  it('may be added only to a new repo, as a task or execute ticket, once per trail', async () => {
    const fresh = await readinessOf({ 'README.md': '' });
    const known = await readinessOf({ 'package.json': '{}' });
    const snap = snapOf([]);
    expect(setupRefusal({ readiness: fresh, snap, type: 'task' })).toBeUndefined();
    expect(setupRefusal({ readiness: fresh, snap, type: 'execute' })).toBeUndefined();
    expect(setupRefusal({ readiness: fresh, snap, type: 'research' })).toMatch(/task or execute/);
    expect(setupRefusal({ readiness: known, snap, type: 'task' })).toMatch(/Only a new repo/);
    const taken = snapOf([ticket({ setup: true, state: 'closed' })]);
    expect(setupRefusal({ readiness: fresh, snap: taken, type: 'task' })).toMatch(/already has its setup ticket, #1/);
  });

  it('completes only with checks: none proposed is refused, with what the repo suggests', () => {
    const t = { key: '#1', setup: true as const };
    const none = { level: 'checks' as const, checks: [] };
    const refused = setupCompletionRefusal({
      t,
      info: none,
      approval: { waiting: false },
      suggested: ['test: npm test'],
    });
    expect(refused).toMatch(/proposes the checks/);
    expect(refused).toMatch(/suggests: test: npm test/);
    expect(setupCompletionRefusal({ t, info: none, approval: { waiting: true }, suggested: [] })).toBeUndefined();
    const some = { level: 'checks' as const, checks: ['test'] };
    expect(setupCompletionRefusal({ t, info: some, approval: { waiting: false }, suggested: [] })).toBeUndefined();
    const plain = { key: '#2' };
    expect(
      setupCompletionRefusal({ t: plain, info: none, approval: { waiting: false }, suggested: [] }),
    ).toBeUndefined();
  });
});
