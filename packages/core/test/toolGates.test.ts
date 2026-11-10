import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  numbered,
  policyViolations,
  repoPath,
  riskLevelFor,
  type RiskPolicy,
  type Ticket,
  type VerificationAttempt,
} from '../src';
import { writeLease } from '../src/agents/leaseStore';
import { readCriteriaProposals, writeCriteriaProposal } from '../src/criteria/criteriaProposals';
import { readCriteria, writeTicketCriteria } from '../src/criteria/criteriaStore';
import { contentHash } from '../src/lib/contentHash';
import { handleCriteriaProposals } from '../src/server/criteriaProposalRoutes';
import { writeAttempt } from '../src/verification/evidenceStore';
import { reviewConflict } from '../src/verification/reviewIndependence';

const policy: RiskPolicy = {
  v: 1,
  categories: {
    schema: 'high',
    'breaking-api': 'high',
    'auth-permissions': 'high',
    billing: 'high',
    'data-deletion': 'high',
    'product-behaviour': 'medium',
    dependencies: 'medium',
  },
  paths: [{ glob: 'infra/**', level: 'high' }],
};

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-gates-core-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function attempt(patch: Partial<VerificationAttempt>): VerificationAttempt {
  return {
    v: 1,
    id: 'A-1',
    mapId: 'm1',
    ticketId: '1',
    ticketKey: '#1',
    agent: 'claude-01',
    level: 'checks',
    configHash: 'h',
    submittedAt: 1,
    finishedAt: 1,
    resolution: 'done',
    checks: [],
    result: 'pass',
    ...patch,
  };
}
const changed = (paths: string[]) => ({
  v: 1 as const,
  changed: paths.map((p) => ({ path: p, add: 1, del: 0 })),
  stats: { files: paths.length, add: 1, del: 0 },
  flags: [],
});

describe('declared paths', () => {
  it('are brought to one repo-relative form, and refused when absolute or outside the repo', () => {
    expect(repoPath('./infra/../infra/x.tf')).toBe('infra/x.tf');
    expect(repoPath('infra\\x.tf')).toBe('infra/x.tf');
    expect(repoPath('src//a/./b.ts')).toBe('src/a/b.ts');
    for (const bad of ['/etc/x', 'C:\\x', '~/x', '../x', 'a/../../x', '.', ''])
      expect(() => repoPath(bad), bad).toThrow();
    expect(riskLevelFor({ paths: ['src/../infra/x.tf'] }, policy)?.level).toBe('high');
    expect(riskLevelFor({ paths: ['INFRA/x.tf'] }, policy)?.level).toBe('low');
    expect(riskLevelFor({ paths: ['INFRA/x.tf'], caseInsensitive: true }, policy)?.level).toBe('high');
  });

  it('takes an absolute path inside the repo as repo-relative, and folds Unicode and Windows spellings', () => {
    expect(repoPath('/work/repo/infra/x.tf', '/work/repo')).toBe('infra/x.tf');
    expect(() => repoPath('/work/other/infra/x.tf', '/work/repo')).toThrow(/absolute path outside the repo/);
    expect(() => repoPath('/work/repo', '/work/repo')).toThrow();
    expect(repoPath('infra./x.tf. ')).toBe('infra/x.tf');
    expect(repoPath('infra /x.tf')).toBe('infra/x.tf');
    expect(repoPath('caf\u0065\u0301/x')).toBe('caf\u00e9/x');
    const nfcRule: RiskPolicy = { ...policy, paths: [{ glob: 'caf\u00e9/**', level: 'high' }] };
    expect(riskLevelFor({ paths: ['caf\u0065\u0301/menu.ts'] }, nfcRule)?.level).toBe('high');
    expect(riskLevelFor({ paths: ['/work/repo/infra/x.tf'], repoRoot: '/work/repo' }, policy)?.level).toBe('high');
  });

  it('policy violations count what git saw and what the agent declared, and name what it left out', () => {
    const found = policyViolations({
      attempts: [
        attempt({ ticketId: '1', declaredPaths: ['src/a.ts'], git: changed(['src/a.ts', 'infra/x.tf']) }),
        attempt({ ticketId: '2', ticketKey: '#2', remote: true, declaredPaths: ['infra/y.tf'] }),
        attempt({ ticketId: '3', ticketKey: '#3', git: changed(['Infra/z.tf']) }),
      ],
      decisions: [],
      policy,
      caseInsensitive: true,
    });
    expect(found.map((v) => [v.ticketKey, v.reason])).toEqual([
      ['#1', 'claude-01 changed infra/x.tf matching infra/** without asking you (infra/x.tf not declared)'],
      ['#2', 'claude-01 says it changed infra/y.tf matching infra/** without asking you'],
      ['#3', 'claude-01 changed Infra/z.tf matching infra/** without asking you'],
    ]);
  });
});

describe('what covers a high-risk change', () => {
  const rules: RiskPolicy = { ...policy, paths: [{ glob: 'infra/**', level: 'high', category: 'schema' }] };
  const a = attempt({ git: changed(['infra/x.tf']) });
  const found = (covered: { mapId: string; ticketId: string; category?: 'schema' | 'billing' }[]) =>
    policyViolations({ attempts: [a], decisions: [], policy: rules, covered }).length;
  it('an answer counts only when it was asked with the rule’s category', () => {
    expect(found([{ mapId: 'm1', ticketId: '1' }])).toBe(1);
    expect(found([{ mapId: 'm1', ticketId: '1', category: 'billing' }])).toBe(1);
    expect(found([{ mapId: 'm1', ticketId: '1', category: 'schema' }])).toBe(0);
  });
});

describe('review independence', () => {
  const t = { id: '1', key: '#1' } as Ticket;
  it('is per token, not per trail name: another session of the worker’s token may not review it', () => {
    writeAttempt(root, attempt({ agent: 'claude-03', sessionId: 's1', origin: 'token:abc' }));
    const sameToken = reviewConflict(root, 'm1', t, { agent: 'claude-04', sessionIds: ['s9'], origin: 'token:abc' });
    expect(sameToken).toMatch(/an agent on your remote token worked on #1/);
    expect(reviewConflict(root, 'm1', t, { agent: 'claude-04', sessionIds: ['s9'], origin: 'token:other' })).toBe(
      undefined,
    );
  });
  it('a claim’s origin counts too', () => {
    writeLease(root, {
      v: 1,
      mapId: 'm1',
      ticketId: '1',
      ticketKey: '#1',
      agent: 'claude-03',
      origin: 'local:x',
      pid: 1,
      claimedAt: 1,
      renewedAt: 1,
      ttlMs: 1,
      expiresAt: 2,
      notes: [],
      decisions: [],
    });
    expect(reviewConflict(root, 'm1', t, { agent: 'codex-01', sessionIds: [], origin: 'local:x' })).toMatch(
      /your own connection/,
    );
  });
});

describe('proposed criteria', () => {
  const post = async (url: string, body: unknown) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
    Object.assign(req, { method: 'POST', headers: {} });
    let status = 0;
    let out = '';
    const res = {
      writeHead: (s: number) => (status = s),
      setHeader: () => {},
      statusCode: 0,
      end: (b: string) => (out = b),
    } as unknown as ServerResponse;
    await handleCriteriaProposals(root, req, res, new URL(`http://x${url}`));
    return { status: status || (res as unknown as { statusCode: number }).statusCode, body: out };
  };

  it('stay a proposal until the trail lead takes one; taking it confirms them', async () => {
    const map = { id: 'm1', title: 'M' };
    const ticket = { id: '1', key: '#1' };
    writeTicketCriteria(root, map, ticket, { criteria: numbered([{ text: 'Real', kind: 'unit' }]) });
    writeTicketCriteria(root, map, ticket, { confirmed: true });
    const criteria = numbered([{ text: 'Trivial', kind: 'unit' }]);
    writeCriteriaProposal(root, 'm1', { ticketId: '1', ticketKey: '#1', criteria, by: 'claude-01', at: 1 });
    expect(readCriteria(root, 'm1')[0]).toMatchObject({ confirmed: true, criteria: [{ text: 'Real' }] });
    await post('/criteria-proposals/dismiss', { mapId: 'm1', ticketId: '1' });
    expect(readCriteriaProposals(root, 'm1')).toEqual([]);
    expect(readCriteria(root, 'm1')[0].criteria[0].text).toBe('Real');
    writeCriteriaProposal(root, 'm1', { ticketId: '1', ticketKey: '#1', criteria, by: 'claude-01', at: 2 });
    await post('/criteria-proposals/accept', { mapId: 'm1', ticketId: '1', title: 'M', hash: contentHash(criteria) });
    expect(readCriteria(root, 'm1')[0]).toMatchObject({ confirmed: true, criteria: [{ text: 'Trivial' }] });
  });
});
