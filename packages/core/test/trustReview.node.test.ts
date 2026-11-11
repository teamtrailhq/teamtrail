import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ActivityStream } from '../src/activity/activityStream';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { writeAgentAnswer } from '../src/agents/agentDocs';
import { AgentDocWriter } from '../src/agents/agentDocWriter';
import { agentPaths } from '../src/agents/agentLink';
import { createTrackerBridge } from '../src/bridge';
import { writeBrief } from '../src/discovery/briefStore';
import { writeKnowledge } from '../src/knowledge/knowledgeStore';
import { ensureLocalDir } from '../src/lib/ensureLocalDir';
import { machineStore } from '../src/machine/machineStore';
import { chartMap } from '../src/planning/operations/chart';
import { approveTogether } from '../src/trust/approveTogether';
import { pendingTrust } from '../src/trust/pendingTrust';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import { operatorAction } from '../src/verification/operatorActions';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { writeWorkspace } from '../src/workspaces/workspaceStore';
import { approveAllHere } from './fakes/trailLead';

/*
 * The review of PR #60: approval actions (not only the gates), committed-only bulk adoption, levels and worktrees,
 * and a config dir an agent's sandbox can't read. Each test failed before its fix.
 */
const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-review-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const SECTIONS = {
  summary: 'S',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};
const now = Date.now();
const entry = (id: string, status: 'confirmed' | 'suggested') => ({
  id,
  title: `Entry ${id}`,
  body: 'Body.',
  kind: 'fact' as const,
  status,
  scope: [],
  tags: [],
  sources: [],
  anchors: [],
  createdBy: 'trail lead',
  createdAt: now,
  updatedAt: now,
});

async function serve(root: string) {
  const bridge = createTrackerBridge(root, { env: {}, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = async (p: string, body: unknown) => {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const get = async (p: string) => (await (await fetch(base + p)).json()) as Record<string, unknown>;
  const close = () => new Promise((r) => (server.closeAllConnections(), server.close(r), bridge.close?.()));
  return { post, get, close };
}

// F1 ---------------------------------------------------------------------------------------------------------------

test('F1: an approval stores the content the page showed, even when the file changed in between', async () => {
  const { recordShown } = await import('../src/trust/recordShown');
  const root = tmpRoot();
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } }, run: ['t'] }),
  );
  const [shown] = pendingTrust(root);
  // a second process swaps the file between the human's click and the write
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { t: { run: ['true'] } }, run: ['t'] }),
  );
  recordShown({ root, item: shown, by: 'trail lead' });
  assert.equal(trustLedger(root).get(trustKey.checks)?.content, shown.content, 'the bytes the human saw');
  assert.equal(pendingTrust(root)[0]?.standing, 'changed', 'the swapped file still waits');
});

test('F1: accepting a brief, confirming criteria or knowledge needs the hash of what the page showed', async () => {
  const root = tmpRoot();
  writeBrief(root, { mapId: 'm1', status: 'submitted', author: 'claude-01', sections: SECTIONS });
  writeKnowledge(root, entry('K-1', 'suggested'));
  const s = await serve(root);
  try {
    assert.equal((await s.post('/briefs/accept', { mapId: 'm1' })).status, 400, 'no hash, no accept');
    const shown = (await s.get('/briefs?mapId=m1')) as { hash: string };
    writeBrief(root, {
      mapId: 'm1',
      status: 'submitted',
      author: 'claude-01',
      sections: { ...SECTIONS, summary: 'Other' },
    });
    assert.equal((await s.post('/briefs/accept', { mapId: 'm1', hash: shown.hash })).status, 409, 'changed since');
    const again = (await s.get('/briefs?mapId=m1')) as { hash: string };
    assert.equal((await s.post('/briefs/accept', { mapId: 'm1', hash: again.hash })).status, 200);

    const call = { id: 'K-1', call: { kind: 'confirm' } };
    assert.equal((await s.post('/knowledge/call', call)).status, 400, 'no hash, no confirm');
    const listed = (await s.get('/knowledge')) as { hashes: Record<string, string> };
    const k1 = { hash: listed.hashes['K-1'] };
    assert.equal((await s.post('/knowledge/call', { ...call, hash: 'sha256:0' })).status, 409);
    assert.equal((await s.post('/knowledge/call', { ...call, hash: k1.hash })).status, 200);
  } finally {
    await s.close();
  }
});

// F3 ---------------------------------------------------------------------------------------------------------------

test('F3: bulk approval adopts only content committed to git; what an agent just staged needs its own look', async () => {
  const root = tmpRoot();
  const repo = path.dirname(root);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo });
  git('init', '-q');
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } } }),
  );
  writeBrief(root, { mapId: 'm1', status: 'accepted', sections: SECTIONS });
  git('add', '.');
  git('commit', '-qm', 'team');
  // an agent drops a confirmed entry while the page is open
  writeKnowledge(root, entry('K-9', 'confirmed'));
  const items = pendingTrust(root);
  assert.equal(items.length, 3);
  const r = await approveTogether({ root, items: items.map((i) => ({ key: i.key, hash: i.hash })), by: 'trail lead' });
  assert.deepEqual(r.approved.sort(), ['brief:m1', 'checks']);
  assert.deepEqual(r.refused, ['knowledge:K-9'], 'uncommitted content is never adopted in bulk');
  const one = pendingTrust(root);
  assert.equal(
    (await approveTogether({ root, items: one.map((i) => ({ key: i.key, hash: i.hash })), by: 'trail lead' })).approved
      .length,
    1,
    'one at a time it can be',
  );
});

// F5 ---------------------------------------------------------------------------------------------------------------

async function verifiedTrail(root: string) {
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: {
        cwd: {
          run: [
            process.execPath,
            '-e',
            `require('fs').writeFileSync(${JSON.stringify(path.join(path.dirname(root), 'cwd.txt'))}, process.cwd())`,
          ],
        },
      },
      run: ['cwd'],
    }),
  );
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [{ ref: 'a', title: 'Build', type: 'execute', body: '' }],
  });
  await operatorAction({ adapter, root }, { action: 'level', mapId: map.id, level: 'checks', by: 'trail lead' });
  return { adapter, mapId: map.id, ticketId: tickets[0].id };
}

test('F5: a trail level lowered in its file waits for approval; the approved level holds', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await verifiedTrail(root);
  await adapter.setMapMeta(mapId, { verification: 'off' });
  const snap = await adapter.loadMap(mapId);
  assert.equal(levelFor(root, snap, snap.tickets[0]).info.level, 'checks');
  assert.ok(pendingTrust(root, [snap]).some((i) => i.key === trustKey.level(mapId)));
});

test('F5: checks never run in a folder an agent named in a workspace record', async () => {
  const root = tmpRoot();
  const { adapter, mapId, ticketId } = await verifiedTrail(root);
  const elsewhere = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-elsewhere-'));
  writeWorkspace(root, {
    v: 1,
    mapId,
    ticketId,
    ticketKey: '#1',
    agent: 'claude-01',
    createdAt: 1,
    path: elsewhere,
    branch: 'x',
    base: 'y',
  } as never);
  await adapter.setMeta(mapId, ticketId, { status: 'verifying' });
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId)!;
  const run = await verify(
    { adapter, root },
    {
      mapId,
      ticket: t,
      info: levelFor(root, snap, t).info,
      sub: { agent: 'claude-01', resolution: 'done', noCodeReason: 'test' },
    },
  );
  const settled = await run.done;
  // N5: neither the planted folder nor the main checkout: the attempt says why and the ticket goes to the human
  assert.equal(existsSync(path.join(path.dirname(root), 'cwd.txt')), false, 'no check ran anywhere');
  assert.equal(settled.attempt.result, 'error');
  assert.match(settled.attempt.note ?? '', /not prepared on this machine/);
});

// lower items --------------------------------------------------------------------------------------------------------

test(
  'a config folder the agent cannot read never crashes the agent, and says so once',
  { skip: process.getuid?.() === 0 },
  async () => {
    const root = tmpRoot();
    const activity = new ActivityStream();
    const writer = new AgentDocWriter(root, activity, { pollMs: 10 });
    const s = activity.startSession({ id: 's_1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
    void s.ask('Go?');
    writer.flush();
    const q = activity.snapshot.pending[0];
    const file = path.join(root, agentPaths.answer('s_1', q.id));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ sessionId: 's_1', questionId: q.id, text: 'yes', author: 'x', at: 1, sig: 'a'.repeat(64) }),
    );
    const blocked = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-blocked-'));
    chmodSync(blocked, 0o000);
    const was = process.env.TEAMTRAIL_CONFIG_DIR;
    process.env.TEAMTRAIL_CONFIG_DIR = path.join(blocked, 'config');
    try {
      await new Promise((r) => setTimeout(r, 80));
    } finally {
      process.env.TEAMTRAIL_CONFIG_DIR = was;
      chmodSync(blocked, 0o700);
      writer.close();
    }
    const alerts = activity.snapshot.feed.filter((f) => /can't read its config folder/.test(f.text));
    assert.equal(alerts.length, 1);
    assert.equal(activity.snapshot.pending.length, 1, 'the question still waits');
  },
);

test('an answer signed for another project is not delivered here', async () => {
  const a = tmpRoot();
  const b = tmpRoot();
  const activity = new ActivityStream();
  const writer = new AgentDocWriter(b, activity, { pollMs: 10 });
  const s = activity.startSession({ id: 's_1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
  let answered: string | undefined;
  void s.ask('Go?').then((x) => (answered = x));
  writer.flush();
  const q = activity.snapshot.pending[0];
  // the same session and question ids, waiting in project A: the answer written there is copied into B
  const docA = path.join(a, agentPaths.session('s_1'));
  mkdirSync(path.dirname(docA), { recursive: true });
  writeFileSync(docA, readFileSync(path.join(b, agentPaths.session('s_1'))));
  writeAgentAnswer(a, { sessionId: 's_1', questionId: q.id, text: 'yes', author: 'trail lead' });
  const target = path.join(b, agentPaths.answer('s_1', q.id));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(path.join(a, agentPaths.answer('s_1', q.id))));
  await new Promise((r) => setTimeout(r, 80));
  writer.close();
  assert.equal(answered, undefined);
});

test('the local-only ignore rule comes back when an agent edits it out', async () => {
  const root = tmpRoot();
  const dir = path.join(root, '.agents');
  ensureLocalDir(dir);
  writeFileSync(path.join(dir, '.gitignore'), '# nothing to ignore\n');
  ensureLocalDir(dir);
  assert.match(readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\*$/m);
});

test(
  'a differently cased path to the same folder is the same project here',
  { skip: process.platform !== 'darwin' },
  async () => {
    const top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-case-'));
    mkdirSync(path.join(top, 'Repo', '.teamtrail'), { recursive: true });
    const a = machineStore(path.join(top, 'Repo', '.teamtrail'));
    const b = machineStore(path.join(top, 'repo', '.teamtrail'));
    assert.equal(a.id, b.id);
    assert.equal(a.id.length, 64, 'the full hash');
  },
);

test('writes queued in the old in-repo outbox wait for the human; nothing sends them', async () => {
  const { legacyOutbox } = await import('../src/adapters/remote/legacyOutbox');
  const root = tmpRoot();
  mkdirSync(path.join(root, '.outbox'));
  const w = {
    id: 'w1',
    mapId: '1',
    label: 'close #2',
    at: 1,
    change: { kind: 'close', ticketId: '2', reason: 'completed' },
  };
  writeFileSync(path.join(root, '.outbox', 'github-octo_x.123-1.json'), JSON.stringify({ v: 1, writes: [w] }));
  assert.deepEqual(legacyOutbox(root).list(), { writes: 1, targets: ['github-octo_x'], labels: ['close #2'] });
  legacyOutbox(root).discard();
  assert.equal(existsSync(path.join(root, '.outbox', 'github-octo_x.123-1.json')), false);
});
