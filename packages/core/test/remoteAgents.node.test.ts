import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { claimTrailName, releaseTrailName } from '../src/agents/trailNameClaim';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import { blobHash } from '../src/knowledge/knowledgeStore';
import { REMOTE_AGENTS_JOURNAL } from '../src/model/lifecycle';
import type { McpEndpoint, RemoteTokenView } from '../src/model/remoteToken';
import { readMcpEndpoints, writeMcpEndpoint } from '../src/remoteAgents/mcpEndpoints';
import {
  createRemoteToken,
  remoteTokenLive,
  remoteTokenViews,
  revokeRemoteToken,
  touchRemoteToken,
  verifyRemoteToken,
} from '../src/remoteAgents/remoteTokens';
import { REMOTE_TOKENS_FILE } from '../src/remoteAgents/remoteTokenStore';

const tmp = (name: string) =>
  path.join(mkdtempSync(path.join(os.tmpdir(), `teamtrail-${name}-`)), 'repo', '.teamtrail');

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let root: string;

before(async () => {
  root = tmp('remote-routes');
  mkdirSync(root, { recursive: true });
  bridge = createTrackerBridge(root, { env: {}, cwd: path.dirname(root) });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  bridge.close();
  server.close();
});

type View = {
  tokens: RemoteTokenView[];
  endpoints: McpEndpoint[];
  token?: string;
  created?: RemoteTokenView;
  error?: string;
};
const call = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, text: await r.clone().text(), json: (await r.json()) as View, headers: r.headers };
};

test('a token is random, verified by hash in constant time, and only its hash is stored', () => {
  const r = tmp('remote-tokens');
  assert.equal(verifyRemoteToken(r, 'tt_anything'), undefined, 'no tokens: nothing verifies');
  const a = createRemoteToken(r, '  cloud   sandbox ');
  const b = createRemoteToken(r, 'laptop');
  assert.match(a.token, /^tt_[\w-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.view.name, 'cloud sandbox');
  const stored = readFileSync(path.join(r, REMOTE_TOKENS_FILE), 'utf8');
  assert.ok(!stored.includes(a.token) && !stored.includes(a.token.slice(3)), 'the token itself is never written');
  assert.match(stored, /"hash": "[0-9a-f]{64}"/);
  assert.equal(readFileSync(path.join(r, '.agents', '.gitignore'), 'utf8'), '*\n');

  assert.equal(verifyRemoteToken(r, a.token)?.id, a.view.id);
  assert.equal(verifyRemoteToken(r, b.token)?.id, b.view.id);
  for (const wrong of [`${a.token}x`, a.token.slice(0, -1), a.token.slice(3), '', 'tt_', `tt_${'a'.repeat(500)}`])
    assert.equal(verifyRemoteToken(r, wrong), undefined);
  assert.equal('hash' in remoteTokenViews(r)[0], false);
});

test('names are required, unique and short; revoking removes exactly that token', () => {
  const r = tmp('remote-names');
  const a = createRemoteToken(r, 'sandbox');
  assert.throws(() => createRemoteToken(r, 'Sandbox'), /already exists/);
  assert.throws(() => createRemoteToken(r, '   '), /Name the agent/);
  assert.throws(() => createRemoteToken(r, 'x'.repeat(61)), /under 60/);
  assert.throws(() => createRemoteToken(r, 42), /Name the agent/);
  const b = createRemoteToken(r, 'laptop');
  assert.equal(revokeRemoteToken(r, 'rt_unknown'), undefined);
  assert.equal(revokeRemoteToken(r, a.view.id)?.name, 'sandbox');
  assert.equal(verifyRemoteToken(r, a.token), undefined);
  assert.equal(remoteTokenLive(r, a.view.id), false);
  assert.equal(verifyRemoteToken(r, b.token)?.name, 'laptop');
  // the name is free again, and the new token is a different one
  const again = createRemoteToken(r, 'sandbox');
  assert.equal(verifyRemoteToken(r, a.token), undefined);
  assert.equal(verifyRemoteToken(r, again.token)?.id, again.view.id);
});

test('last use is kept apart from the tokens, so recording it can never bring a revoked token back', () => {
  const r = tmp('remote-use');
  const a = createRemoteToken(r, 'sandbox', 1000);
  touchRemoteToken(r, a.view.id, 5_000_000);
  touchRemoteToken(r, a.view.id, 5_030_000);
  assert.equal(remoteTokenViews(r)[0].lastUsedAt, 5_000_000, 'kept to the minute');
  touchRemoteToken(r, a.view.id, 5_070_000);
  assert.equal(remoteTokenViews(r)[0].lastUsedAt, 5_070_000);
  revokeRemoteToken(r, a.view.id);
  touchRemoteToken(r, a.view.id, 9_000_000);
  assert.deepEqual(remoteTokenViews(r), []);
  assert.equal(verifyRemoteToken(r, a.token), undefined);
});

test('a damaged token file closes the endpoint instead of opening it', () => {
  const r = tmp('remote-damaged');
  const a = createRemoteToken(r, 'sandbox');
  writeFileSync(path.join(r, REMOTE_TOKENS_FILE), '{ "v": 1, "tokens": [{ "id": "x" }, null, 3] ');
  assert.equal(verifyRemoteToken(r, a.token), undefined);
  writeFileSync(path.join(r, REMOTE_TOKENS_FILE), '{ "v": 1, "tokens": [{ "id": "x" }, null, 3] }');
  assert.deepEqual(remoteTokenViews(r), []);
});

test('routes: the token is shown once, lists never carry it, and both actions are journaled', async () => {
  const empty = await call('GET', '/remote-agents');
  assert.deepEqual(empty.json, { tokens: [], endpoints: [] });

  const made = await call('POST', '/remote-agents/tokens', { name: 'cloud sandbox' });
  assert.equal(made.status, 200);
  assert.match(made.json.token ?? '', /^tt_/);
  assert.equal(made.headers.get('cache-control'), 'no-store');
  assert.equal(made.json.created?.name, 'cloud sandbox');
  const token = made.json.token!;
  assert.equal(verifyRemoteToken(root, token)?.id, made.json.created?.id);

  const listed = await call('GET', '/remote-agents');
  assert.equal(listed.json.tokens.length, 1);
  assert.ok(!listed.text.includes(token) && !listed.text.includes('hash'));

  assert.equal((await call('POST', '/remote-agents/tokens', { name: 'cloud sandbox' })).status, 400);
  assert.equal((await call('POST', '/remote-agents/tokens', {})).status, 400);
  assert.equal((await call('POST', '/remote-agents/tokens/revoke', { id: 'rt_nope' })).status, 404);
  assert.equal((await call('POST', '/remote-agents/tokens/revoke', {})).status, 400);

  const revoked = await call('POST', '/remote-agents/tokens/revoke', { id: made.json.created!.id });
  assert.deepEqual(revoked.json.tokens, []);
  assert.equal(verifyRemoteToken(root, token), undefined);

  const entries = journalFile(root).readRemoteAgents(REMOTE_AGENTS_JOURNAL);
  assert.deepEqual(
    entries.map((e) => [e.action, e.name, e.tokenId, e.actor, e.actorKind]),
    [
      ['token-created', 'cloud sandbox', made.json.created!.id, 'trail lead', 'trail lead'],
      ['token-revoked', 'cloud sandbox', made.json.created!.id, 'trail lead', 'trail lead'],
    ],
  );
  const journal = readFileSync(journalPath(root, REMOTE_AGENTS_JOURNAL), 'utf8');
  assert.ok(!journal.includes(token) && !journal.includes('hash'), 'the journal never holds the token');
  assert.ok(existsSync(path.join(root, '.events', '.gitignore')));
});

test('routes: an agent token opens nothing here, and another site cannot create or revoke', async () => {
  const made = await call('POST', '/remote-agents/tokens', { name: 'laptop' });
  // The bridge does not look at agent tokens at all: holding one changes no answer.
  const withToken = await call('GET', '/remote-agents', undefined, { Authorization: `Bearer ${made.json.token}` });
  assert.ok(!withToken.text.includes(made.json.token!));

  const before = (await call('GET', '/remote-agents')).json.tokens.length;
  const crossSite = await call('POST', '/remote-agents/tokens', { name: 'evil' }, { Origin: 'http://evil.example' });
  assert.equal(crossSite.status, 403);
  const form = await fetch(`${base}/remote-agents/tokens`, { method: 'POST', body: '{"name":"evil"}' });
  assert.equal(form.status, 403, 'a form post (no JSON content type) is refused');
  const crossRevoke = await call(
    'POST',
    '/remote-agents/tokens/revoke',
    { id: made.json.created!.id },
    { Origin: 'http://evil.example' },
  );
  assert.equal(crossRevoke.status, 403);
  assert.equal((await call('GET', '/remote-agents')).json.tokens.length, before);
});

test('journal: old lines, new kinds and kinds from the future read side by side', () => {
  const r = tmp('remote-journal');
  const j = journalFile(r);
  const transition = {
    v: 1 as const,
    at: 1,
    mapId: REMOTE_AGENTS_JOURNAL,
    ticketId: '1',
    ticketKey: '#1',
    event: 'claim' as const,
    from: 'ready' as const,
    to: 'working' as const,
    actor: 'claude-01',
    actorKind: 'agent' as const,
  };
  mkdirSync(path.join(r, '.events'), { recursive: true });
  // the first journals had no `kind`
  appendFileSync(journalPath(r, REMOTE_AGENTS_JOURNAL), JSON.stringify(transition) + '\n');
  j.append({ ...transition, kind: 'transition', at: 2 });
  j.append({
    v: 1,
    kind: 'remote-agent',
    at: 3,
    mapId: REMOTE_AGENTS_JOURNAL,
    action: 'token-created',
    tokenId: 'rt_1',
    name: 'sandbox',
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  j.append({
    v: 1,
    kind: 'guide',
    at: 4,
    mapId: REMOTE_AGENTS_JOURNAL,
    action: 'approved',
    guide: 'qa',
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  appendFileSync(
    journalPath(r, REMOTE_AGENTS_JOURNAL),
    '{"v":1,"kind":"from-the-future","at":5,"mapId":"x"}\n{"torn":',
  );
  assert.deepEqual(
    j.read(REMOTE_AGENTS_JOURNAL).map((e) => e.at),
    [1, 2],
  );
  assert.deepEqual(
    j.readAll(REMOTE_AGENTS_JOURNAL).map((e) => e.at),
    [1, 2],
  );
  assert.deepEqual(
    j.readGuides(REMOTE_AGENTS_JOURNAL).map((e) => e.at),
    [4],
  );
  assert.deepEqual(
    j.readRemoteAgents(REMOTE_AGENTS_JOURNAL).map((e) => [e.at, e.action, e.name]),
    [[3, 'token-created', 'sandbox']],
  );
});

test('endpoints: listed while their process lives, the one made for sharing first', async () => {
  const r = tmp('remote-endpoints');
  assert.deepEqual(readMcpEndpoints(r), []);
  const release = writeMcpEndpoint(r, { url: 'http://localhost:7420/mcp', kind: 'lookout', network: false });
  const dir = path.join(r, '.agents', 'mcp-endpoints');
  // a server that crashed: its pid is gone
  writeFileSync(
    path.join(dir, '999999999.json'),
    JSON.stringify({ url: 'http://x/mcp', pid: 999999999, kind: 'standalone', network: true, startedAt: 1 }),
  );
  assert.deepEqual(
    readMcpEndpoints(r).map((e) => e.url),
    ['http://localhost:7420/mcp'],
  );
  release();
  assert.deepEqual(readdirSync(dir), ['999999999.json']);
  assert.deepEqual(readMcpEndpoints(r), []);
});

test('knowledge anchors: a path outside the repo is never read', () => {
  const repo = path.dirname(tmp('remote-anchors'));
  mkdirSync(path.join(repo, 'src'), { recursive: true });
  writeFileSync(path.join(repo, 'src', 'a.ts'), 'export {}');
  writeFileSync(path.join(path.dirname(repo), 'secret.txt'), 'outside');
  assert.match(blobHash(repo, 'src/a.ts') ?? '', /^[0-9a-f]{40}$/);
  assert.equal(blobHash(repo, '../secret.txt'), undefined);
  assert.equal(blobHash(repo, path.join(path.dirname(repo), 'secret.txt')), undefined);
  assert.equal(blobHash(repo, 'src/missing.ts'), undefined);
});

test('trail names: agents sharing one process each get their own, and give it back', () => {
  const r = tmp('remote-names-lock');
  const a = claimTrailName(r, 'claude', new Set(), 'holder-a');
  const b = claimTrailName(r, 'claude', new Set(), 'holder-b');
  assert.deepEqual([a, b], ['claude-01', 'claude-02']);
  assert.equal(claimTrailName(r, 'claude', new Set(), 'holder-a'), 'claude-01', 'asking again keeps the name');
  releaseTrailName(r, 'claude-01', 'holder-b');
  assert.equal(claimTrailName(r, 'claude', new Set(), 'holder-c'), 'claude-03', "another holder can't release it");
  releaseTrailName(r, 'claude-01', 'holder-a');
  assert.equal(claimTrailName(r, 'claude', new Set(), 'holder-d'), 'claude-01');
});
