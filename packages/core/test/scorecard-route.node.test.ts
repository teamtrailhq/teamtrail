import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import type { Scorecard } from '../src/model/scorecard';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { writeAttempt, writeVerdict } from '../src/verification/evidenceStore';
import { tempFolder } from './tempFolder';

let server: http.Server;
let bridge: TrackerBridge;
let base: string;

before(async () => {
  const tmp = tempFolder('teamtrail-scorecard-');
  const root = path.join(tmp, '.teamtrail');
  mkdirSync(path.join(root, '.agents', 'sessions'), { recursive: true });
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const sections = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
  const { map, tickets } = await chartMap(a, {
    title: 'Checkout',
    sections,
    tickets: [
      { ref: 'a', title: 'First', type: 'task', body: '' },
      { ref: 'b', title: 'Second', type: 'task', body: '' },
    ],
  });
  const attempt = (ticketId: string, id: string, result: 'pass' | 'fail'): VerificationAttempt => ({
    v: 1,
    id,
    mapId: map.id,
    ticketId,
    ticketKey: '#',
    agent: 'claude-01',
    sessionId: 's1',
    level: 'checks',
    configHash: 'h',
    submittedAt: 1,
    finishedAt: 2,
    resolution: 'done',
    checks: [],
    result,
  });
  writeAttempt(root, attempt(tickets[0].id, 'A-1', 'pass'));
  writeAttempt(root, attempt(tickets[1].id, 'A-1', 'fail'));
  writeAttempt(root, attempt(tickets[1].id, 'A-2', 'pass'));
  writeVerdict(root, {
    v: 1,
    mapId: map.id,
    ticketId: tickets[1].id,
    attemptId: 'A-2',
    by: 'codex-01',
    byKind: 'agent',
    verdict: 'PASS',
    summary: 'ok',
    findings: [{ severity: 'warn', text: 'naming' }],
    at: 3,
  });
  await a.close(map.id, tickets[0].id, 'completed');
  await a.close(map.id, tickets[1].id, 'completed');
  const session = {
    id: 's1',
    agent: 'claude-01',
    mode: 'work',
    mapId: map.id,
    step: 1,
    total: 1,
    stepLabel: 'x',
    status: 'done',
    startedAt: 1,
    model: 'claude-sonnet-5-5',
    usage: { costUsd: 3, inputTokens: 1, outputTokens: 1, source: 'reported' },
  };
  writeFileSync(
    path.join(root, '.agents', 'sessions', 's1.json'),
    JSON.stringify({ v: 1, session, chats: [], pending: [], answered: [], feed: [], pid: 0, updatedAt: 5 }),
  );
  bridge = createTrackerBridge(root, { env: {}, configDir: path.join(tmp, 'config'), cwd: tmp });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  bridge.close();
  server.close();
});

test("GET /scorecard reads the repo's attempts, verdicts and session records", async () => {
  const r = await fetch(`${base}/scorecard`);
  assert.equal(r.status, 200);
  const card = (await r.json()) as Scorecard;
  assert.equal(card.tickets, 2);
  assert.deepEqual(
    card.byModel.map((x) => [x.key, x.tickets, x.verifiedFirstTime, x.costPerVerifiedUsd, x.findings.warn]),
    [['claude-sonnet-5-5', 2, 1, 1.5, 1]],
  );
});
