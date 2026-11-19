import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { journalFile, journalPath } from '../src/history/journalFile';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { checksApproval, trustedChecks } from '../src/verification/checksApproval';
import { checksDiff } from '../src/verification/checksDiff';
import { parseVerificationConfig } from '../src/verification/config';
import { heldRulesStore } from '../src/verification/heldRulesStore';
import { matchRules } from '../src/verification/matchRules';
import { ruleOutcomes } from '../src/verification/ruleOutcomes';
import { rulesForTouches } from '../src/verification/rulesForTouches';
import { rulesGate } from '../src/verification/rulesGate';
import { ruleWaivers } from '../src/verification/ruleWaivers';
import { setChecks, StaleChecks } from '../src/verification/setChecks';
import { setRules } from '../src/verification/setRules';
import { tempFolder } from './tempFolder';

const checks = { test: { run: ['npm', 'test'] }, e2e: { run: ['npm', 'run', 'e2e'] } };
const parse = (rules: unknown) => parseVerificationConfig(JSON.stringify({ v: 1, checks, rules }));
const R1 = { id: 'R-1', when: ['src/session/**'], ask: 'Do old transcripts still load?', why: 'D-12: #34' };
const R2 = { id: 'R-2', when: ['src/api'], check: 'e2e', why: 'the API broke the app once' };

const tmpRoot = () => {
  const root = path.join(tempFolder('teamtrail-rules-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const withChecks = () => {
  const root = tmpRoot();
  setChecks({ root, base: 'none', by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'] }] });
  return root;
};

test('parses rules, and reports every problem', () => {
  assert.deepEqual(parse([R1, R2]).config?.rules, [R1, R2]);
  assert.deepEqual(parseVerificationConfig('{"v":1}').config?.rules, []);
  const { errors } = parse([
    { id: 'X', when: [], why: '' },
    { id: 'R-2', when: ['/etc/**', '../up'], check: 'nope', why: 'w' },
    { ...R1, extra: true },
    R1,
  ]);
  assert.deepEqual(errors, [
    'rules[0].id must be R-<number>',
    'rules[0].when must list 1–20 path globs',
    'rules[0] needs a "check" to run or a question to "ask"',
    'rules[0].why must say, in one line of at most 300, why the rule exists',
    'rules[1].when[0] must be relative to the repo',
    'rules[1].when[1] must stay inside the repo',
    'rules[1].check must name a check in "checks"',
    'rules[2]: unknown extra',
    '"rules" names R-1 twice',
  ]);
  assert.match(parse([{ ...R1, ask: 'two\nlines' }]).errors[0], /ask must be one line/);
});

test('matches the files a change touched, and the touches a claim declared', () => {
  const rules = parse([R1, R2]).config!.rules;
  assert.deepEqual(
    matchRules(rules, ['src/api/x.ts', 'src/session/a.ts', 'src/session/b.ts', 'readme.md']).map((m) => [
      m.rule.id,
      m.files,
    ]),
    [
      ['R-1', ['src/session/a.ts', 'src/session/b.ts']],
      ['R-2', ['src/api/x.ts']],
    ],
  );
  assert.deepEqual(matchRules(rules, ['src/apiary.ts']), []);
  assert.deepEqual(
    rulesForTouches(rules, ['src/**', 'docs/**']).map((m) => [m.rule.id, m.touches]),
    [
      ['R-1', ['src/**']],
      ['R-2', ['src/**']],
    ],
  );
});

test('the gate holds an unanswered question under enforce, journals it, and lets an answer or a waiver through', () => {
  const root = tmpRoot();
  const config = parse([R1, R2]).config!;
  const ticket = { id: 't1', key: '#1' };
  const base = { root, mapId: 'm1', ticket, config, files: ['src/session/a.ts', 'src/api/b.ts'], agent: 'claude-01' };
  const held = rulesGate(base);
  assert.equal(held.held, true);
  assert.deepEqual(
    held.unanswered.map((r) => r.id),
    ['R-1'],
  );
  assert.equal(heldRulesStore.read(root, 'm1', 't1')?.rules[0].id, 'R-1');
  assert.match(journalFile(root).readGates('m1')[0].reason, /claude-01 left R-1 unanswered on #1/);

  assert.equal(rulesGate({ ...base, answers: [{ rule: 'R-1', answer: '  ' }] }).held, true, 'blank is no answer');
  assert.equal(rulesGate({ ...base, answers: [{ rule: 'R-1', answer: 'yes, tested' }] }).held, false);
  assert.equal(heldRulesStore.read(root, 'm1', 't1'), undefined);

  const observe = { ...config, gates: { ...config.gates, 'diff-rules': 'observe' as const } };
  assert.equal(rulesGate({ ...base, config: observe }).held, false);
  assert.equal(journalFile(root).readGates('m1').at(-1)?.mode, 'observe');
  const off = { ...config, gates: { ...config.gates, 'diff-rules': 'off' as const } };
  assert.equal(rulesGate({ ...base, config: off }).held, false);
  assert.equal(journalFile(root).readGates('m1').length, 3, 'off records nothing');

  ruleWaivers.add(root, {
    v: 1,
    mapId: 'm1',
    ticketId: 't1',
    ticketKey: '#1',
    rule: 'R-1',
    reason: 'n/a',
    by: 'Ada',
    via: 'lookout',
    at: 5,
  });
  assert.equal(rulesGate(base).held, false);
  const out = ruleOutcomes({ root, mapId: 'm1', ticketId: 't1', rules: config.rules, files: base.files });
  assert.deepEqual(out.checks, ['e2e']);
  assert.deepEqual(out.rules[0].waived, { by: 'Ada', reason: 'n/a', at: 5 });
});

test('set from the Lookout and approved in one step, new rules numbered, over the file as loaded only', () => {
  const root = withChecks();
  const rules = [
    { when: ['src/session/**', ''], ask: R1.ask, why: R1.why },
    { id: 'R-4', when: ['a'], check: 'test', why: 'w' },
  ];
  const approval = setRules({ root, rules, base: checksApproval(root).hash, by: 'Ada' });
  assert.equal(approval.state, 'approved');
  const written = JSON.parse(readFileSync(path.join(root, 'verification.json'), 'utf8'));
  assert.deepEqual(
    written.rules.map((r: { id: string }) => r.id),
    ['R-5', 'R-4'],
  );
  assert.deepEqual(written.rules[0].when, ['src/session/**']);
  assert.equal(trustedChecks(root).config.config?.rules.length, 2, 'what applies now');
  assert.match(journalFile(root).readTrust(TRUST_JOURNAL).at(-1)!.subject, /diff rules: 2 diff rules/);

  assert.throws(() => setRules({ root, rules: [], base: 'old', by: 'Ada' }), StaleChecks);
  const bad = [{ when: ['x'], check: 'deploy', why: 'w' }];
  assert.throws(() => setRules({ root, rules: bad, base: checksApproval(root).hash, by: 'Ada' }), /must name a check/);
  setRules({ root, rules: [], base: checksApproval(root).hash, by: 'Ada' });
  assert.equal(JSON.parse(readFileSync(path.join(root, 'verification.json'), 'utf8')).rules, undefined);
  assert.equal(thisMachineOnly('PUT', '/verification/rules'), true);
  assert.equal(thisMachineOnly('GET', '/verification/rules'), false);
});

test('a rule an agent writes into the file waits for approval, and the approval shows it in full', () => {
  const root = withChecks();
  const file = path.join(root, 'verification.json');
  const approved = readFileSync(file, 'utf8');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(approved), rules: [{ ...R2, check: 'test' }] }));
  assert.equal(checksApproval(root).waiting, true);
  assert.deepEqual(trustedChecks(root).config.config?.rules ?? [], [], 'the approved file still applies');
  assert.deepEqual(checksDiff(approved, readFileSync(file, 'utf8')).lines, [
    '+ rule R-2: when src/api changes: runs test (why: the API broke the app once)',
  ]);
});

test('a journal with rule waivers among older kinds still reads', () => {
  const root = tmpRoot();
  const j = journalFile(root);
  j.append({
    v: 1,
    kind: 'gate',
    at: 1,
    mapId: 'm',
    gate: 'diff-rules',
    mode: 'enforce',
    reason: 'r',
    actor: 'x',
    actorKind: 'engine',
  });
  appendFileSync(journalPath(root, 'm'), '{"v":1,"kind":"something-newer","mapId":"m"}\n');
  j.append({
    v: 1,
    kind: 'rule-waiver',
    at: 2,
    mapId: 'm',
    ticketId: 't',
    ticketKey: '#1',
    rule: 'R-1',
    reason: 'n/a',
    actor: 'Ada',
    actorKind: 'trail lead',
  });
  j.append({
    v: 1,
    kind: 'rule-waiver',
    at: 3,
    mapId: 'm',
    ticketId: 't',
    ticketKey: '#1',
    rule: 'R-1',
    action: 'undone',
    reason: 'n/a',
    actor: 'Ada',
    actorKind: 'trail lead',
  });
  assert.equal(j.readGates('m').length, 1);
  assert.deepEqual(
    j.readRuleWaivers('m').map((e) => [e.rule, e.action]),
    [
      ['R-1', undefined],
      ['R-1', 'undone'],
    ],
    'a waiver from before Undo has no action',
  );
  assert.deepEqual(j.readAll('m'), []);
});
