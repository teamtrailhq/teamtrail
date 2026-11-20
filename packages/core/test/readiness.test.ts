import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_MODE, type MapSnapshot, type Ticket } from '../src';
import type { CheckFinding } from '../src/model/checkScreening';
import type { LocalProbes, ReadinessFinding } from '../src/model/readiness';
import type { CheckSpec, VerificationConfig } from '../src/model/verification';
import { holdingFindings } from '../src/readiness/holdingFindings';
import { readinessHeld } from '../src/readiness/readinessHeld';
import { repoReadiness } from '../src/readiness/repoReadiness';
import type { ReadinessInput } from '../src/readiness/types';
import { versionMatches } from '../src/readiness/versionMatches';
import { detectRepoProfile, suggestChecks } from '../src/repoProfile';
import { DEFAULT_CONFIG } from '../src/verification/config';
import { profileRepoFiles } from './fakes/profileRepoFiles';

const now = Date.UTC(2026, 10, 19, 12);

/** Everything here: no program, toolchain, install, browser or service is missing. */
const allHere = (over: Partial<LocalProbes> = {}): LocalProbes => ({
  programs: {},
  toolchains: {},
  installed: {},
  browser: { found: true },
  services: {},
  variables: { passed: [], withheld: [] },
  ...over,
});

function config(checks: Record<string, { run: string[]; cwd?: string }>, setup = {}): VerificationConfig {
  const specs: Record<string, CheckSpec> = {};
  for (const [name, c] of Object.entries(checks)) specs[name] = { ...c, timeoutSec: 600 };
  return { ...DEFAULT_CONFIG, checks: specs, run: Object.keys(checks), setup };
}

async function readiness(o: {
  repo?: string;
  config?: VerificationConfig;
  probes?: LocalProbes;
  screening?: CheckFinding[];
  state?: ReadinessInput['approval']['state'];
}) {
  const profile = await detectRepoProfile(profileRepoFiles(o.repo ?? 'node-npm-workspaces'));
  return repoReadiness({
    profile,
    approval: { state: o.state ?? 'approved', waiting: false, hash: 'sha256:base' },
    config: o.config,
    screening: o.screening ?? [],
    suggestions: suggestChecks(profile),
    probes: o.probes,
    now,
  });
}

const byId = (r: { findings: ReadinessFinding[] }, id: string) => r.findings.find((f) => f.id === id);
const WEB = { 'web-test': { run: ['npm', 'test'], cwd: 'apps/web' } };

describe('repo readiness: checks', () => {
  it('no checks blocks, with the known suggested checks as one fix, hashed as shown', async () => {
    const r = await readiness({ probes: allHere() });
    const none = byId(r, 'checks-none')!;
    expect(none).toMatchObject({ level: 'blocks', kind: 'checks', text: "Teamtrail can't verify work yet: no checks" });
    expect(none.fix?.kind).toBe('add-checks');
    const added = none.fix?.kind === 'add-checks' ? none.fix.checks : [];
    expect(added.every((c) => c.known)).toBe(true);
    expect(added.map((c) => `${c.name} in ${c.cwd || '.'}`)).toContain('web-test in apps/web');
    expect(none.fixHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.blocking).toBe(1);
    expect(r.findings[0].id).toBe('checks-none');
    const web = r.units.find((u) => u.dir === 'apps/web')!;
    expect(web.needs.find((n) => n.kind === 'unit')).toMatchObject({ ok: false, finding: 'checks-none' });
  });

  it('checks nobody approved here block as their own finding, pointing at Approvals', async () => {
    const r = await readiness({ state: 'first', probes: allHere() });
    expect(byId(r, 'checks-unapproved')).toMatchObject({ level: 'blocks' });
    expect(byId(r, 'checks-none')).toBeUndefined();
  });

  it("screening: a check that won't run blocks it; one that may not warns; not installed is an install matter", async () => {
    const screening: CheckFinding[] = [
      { check: 'web-test', severity: 'wont-run', text: 'no script `tset`' },
      { check: 'lint', severity: 'unsure', text: 'unsure about `eslint`' },
      { check: 'types', severity: 'wont-run', text: '`tsc` is not installed', cause: 'not-installed' },
    ];
    const c = config({ ...WEB, lint: { run: ['npm', 'run', 'lint'] }, types: { run: ['npm', 'run', 'typecheck'] } });
    const r = await readiness({ config: c, screening, probes: allHere() });
    expect(byId(r, 'check:web-test')).toMatchObject({ level: 'blocks', checks: ['web-test'] });
    expect(byId(r, 'check:lint')).toMatchObject({ level: 'warns' });
    expect(byId(r, 'check:types')).toBeUndefined();
    expect(byId(r, 'check:types:install')).toMatchObject({ kind: 'install', level: 'warns', checks: ['types'] });
  });

  it('a check written for one folder that runs in another: set its folder in one click', async () => {
    const r = await readiness({ config: config({ types: { run: ['npm', 'run', 'typecheck'] } }), probes: allHere() });
    const f = byId(r, 'folder:types')!;
    expect(f).toMatchObject({ level: 'warns', fix: { kind: 'set-folder', check: 'types', cwd: 'packages/ui' } });
  });

  it("units whose tests no check runs, each with its suggested check; the top isn't covered by a subfolder's", async () => {
    const r = await readiness({ config: config(WEB), probes: allHere() });
    expect(byId(r, 'unit:apps/web')).toBeUndefined();
    const ui = byId(r, 'unit:packages/ui')!;
    const added = ui.fix?.kind === 'add-checks' ? ui.fix.checks : [];
    expect(added.map((c) => `${c.name}: ${c.run.join(' ')} in ${c.cwd}`)).toEqual([
      'ui-test: npm test in packages/ui',
      'ui-typecheck: npm run typecheck in packages/ui',
    ]);
    expect(byId(r, 'unit:')).toMatchObject({ level: 'warns' });
    expect(r.blocking).toBe(0);
  });
});

describe('repo readiness: this machine', () => {
  it("a program the checks start that isn't here blocks those checks; one only setup uses warns", async () => {
    const c = config(WEB, { deps: { run: ['pnpm', 'install', '--frozen-lockfile'], timeoutSec: 900 } });
    const r = await readiness({ config: c, probes: allHere({ programs: { npm: {}, pnpm: {} } }) });
    expect(byId(r, 'program:npm')).toMatchObject({ level: 'blocks', checks: ['web-test'] });
    expect(byId(r, 'program:pnpm')).toMatchObject({ level: 'warns' });
    expect(byId(r, 'program:pnpm')?.checks).toBeUndefined();
  });

  it('a pinned toolchain: missing or outside the pin warns, a version manager shim says nothing', async () => {
    const old = await readiness({
      config: config(WEB),
      probes: allHere({ toolchains: { node: { path: '/x/node', version: '18.19.0' } } }),
    });
    expect(byId(old, 'version:')).toMatchObject({
      level: 'warns',
      text: 'Node 18.19.0 here; the top asks for 20.11.1',
    });
    const fits = await readiness({
      config: config(WEB),
      probes: allHere({ toolchains: { node: { path: '/x/node', version: '20.11.1' } } }),
    });
    expect(byId(fits, 'version:')).toBeUndefined();
    const shim = await readiness({
      config: config(WEB),
      probes: allHere({ toolchains: { node: { path: '/x', managed: 'mise' } } }),
    });
    expect(byId(shim, 'version:')).toBeUndefined();
    const none = await readiness({ config: config(WEB), probes: allHere({ toolchains: { node: {} } }) });
    expect(byId(none, 'version:')?.text).toMatch(/^Node isn't installed on this machine/);
  });

  it('dependencies not installed: the frozen install to copy, and a setup step to add; info once one installs them', async () => {
    const r = await readiness({ config: config(WEB), probes: allHere({ installed: { '': false } }) });
    const f = byId(r, 'install:')!;
    expect(f).toMatchObject({ level: 'warns', howTo: ['npm ci'], checks: ['web-test'] });
    expect(f.fix).toEqual({ kind: 'add-setup', name: 'deps', run: ['npm', 'ci'], cwd: '' });
    const setup = { deps: { run: ['npm', 'ci'], timeoutSec: 900 } };
    const covered = await readiness({ config: config(WEB, setup), probes: allHere({ installed: { '': false } }) });
    expect(byId(covered, 'install:')).toMatchObject({ level: 'info' });
    expect(byId(covered, 'install:')?.fix).toBeUndefined();
  });

  it('a browser, services and variable names the tests need, never a value', async () => {
    const probes = allHere({
      browser: { found: false },
      services: { postgres: false },
      variables: { passed: ['LOG_LEVEL'], withheld: ['DATABASE_URL'] },
    });
    const r = await readiness({ config: config(WEB), probes });
    expect(byId(r, 'browser')).toMatchObject({ level: 'warns', text: 'No browser found for the tests in apps/web' });
    expect(byId(r, 'service:postgres')).toMatchObject({ text: "postgres isn't reachable on 127.0.0.1:5432" });
    expect(byId(r, 'variable:LOG_LEVEL')).toBeUndefined();
    expect(byId(r, 'variable:DATABASE_URL')?.text).toBe('DATABASE_URL is set here but not passed to checks');
    const stripe = byId(r, 'variable:STRIPE_SECRET_KEY')!;
    expect(stripe.text).toBe("STRIPE_SECRET_KEY isn't set where teamtrail runs");
    expect(stripe.why).toMatch(/reads like a secret/);
    expect(stripe.howTo?.[0]).toMatch(/^TEAMTRAIL_CHECK_ENV="STRIPE_SECRET_KEY" teamtrail/);
    expect(JSON.stringify(r)).not.toContain('postgres://');
    const web = r.units.find((u) => u.dir === 'apps/web')!;
    expect(web.needs.find((n) => n.kind === 'browser')).toMatchObject({ ok: false, finding: 'browser' });
  });

  it('without probes nothing about the machine is said; the same input reads the same', async () => {
    const r = await readiness({ config: config(WEB) });
    expect(r.probed).toBe('skipped');
    expect(r.findings.every((f) => ['unit', 'folder', 'check', 'checks'].includes(f.kind))).toBe(true);
    const a = await readiness({ config: config(WEB), probes: allHere({ installed: { '': false } }) });
    const b = await readiness({ config: config(WEB), probes: allHere({ installed: { '': false } }) });
    expect(a).toEqual(b);
  });
});

describe('versionMatches', () => {
  it.each([
    ['20', 'v20.11.0', true],
    ['20.11.1', '20.11.1', true],
    ['20', '18.0.0', false],
    ['>=18 <21', '20.1.0', true],
    ['>=18 <21', '22.0.0', false],
    ['^20.1', '20.9.0', true],
    ['^20.1', '21.0.0', false],
    ['~3.12', '3.12.4', true],
    ['>=3.10,<4', 'Python 3.12.1', true],
    ['~=3.10', '3.11.0', true],
    ['~=3.10', '4.0.0', false],
    ['18.x', '18.20.1', true],
    ['20 || 22', '22.3.0', true],
    ['>=1.22', 'go version go1.23.1 darwin/arm64', true],
    ['lts/*', '20.0.0', undefined],
    ['stable', '1.79.0', undefined],
  ])('%s against %s', (range, version, want) => {
    expect(versionMatches(range, version)).toBe(want);
  });
});

function ticket(id: string, type: Ticket['type'], blockedBy: string[] = []): Ticket {
  return {
    id,
    key: `#${id}`,
    title: id,
    type,
    body: '',
    state: 'open',
    blockedBy,
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}
const snap = (tickets: Ticket[]): MapSnapshot => ({
  map: {
    id: 'm1',
    key: '#1',
    title: 'T',
    mode: DEFAULT_MAP_MODE,
    sections: {} as MapSnapshot['map']['sections'],
    createdAt: now,
    updatedAt: now,
  },
  tickets,
});

describe('the readiness hold', () => {
  const tickets = [ticket('r', 'research'), ticket('a', 'task'), ticket('b', 'execute'), ticket('c', 'task', ['a'])];
  const blocks = (id: string, checks?: string[]): ReadinessFinding => ({
    id,
    kind: 'checks',
    level: 'blocks',
    text: id,
    why: '',
    ...(checks ? { checks } : {}),
  });

  it('holds ready implementation work verified with checks; research and unverified work go on', () => {
    const held = readinessHeld({
      snap: snap(tickets),
      findings: [blocks('checks-none')],
      checksOf: (t) => (t.id === 'b' ? undefined : []),
    });
    expect(held.map((t) => t.id)).toEqual(['a']);
  });

  it('a finding about some checks holds only the work that runs them', () => {
    const findings = [blocks('program:go', ['api-test'])];
    const held = readinessHeld({
      snap: snap(tickets),
      findings,
      checksOf: (t) => (t.id === 'a' ? ['web-test'] : ['api-test']),
    });
    expect(held.map((t) => t.id)).toEqual(['b']);
  });

  it('Start anyway passes the findings it was made past, not ones that come up later', async () => {
    const r = await readiness({ probes: allHere() });
    const choice = { at: now, by: 'trail lead', findings: ['checks-none'] };
    expect(holdingFindings(r, choice)).toEqual([]);
    const later = { ...r, findings: [...r.findings, blocks('program:npm', ['web-test'])] };
    expect(holdingFindings(later, choice).map((f) => f.id)).toEqual(['program:npm']);
  });
});
