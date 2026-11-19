import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { GitHubProofPublisher } from '../src/evidence/github/GitHubProofPublisher';
import { writeTicketSync } from '../src/evidence/syncStore';
import type { TicketSync } from '../src/model/prEvidence';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { readProofPost } from '../src/proof/proofPostStore';
import { publishProofs } from '../src/proof/publishProofs';
import { writeAttempt } from '../src/verification/evidenceStore';
import { tempFolder } from './tempFolder';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

interface Comment {
  id: number;
  html_url: string;
  body: string;
  user: { login: string };
}

/** GitHub's comment and status endpoints for one repo, in memory; `down` makes every call fail. */
function fakeGitHub() {
  const comments: Comment[] = [];
  const statuses: { sha: string; state: string; description: string; context: string; target_url?: string }[] = [];
  const calls: string[] = [];
  let down = false;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    if (down) throw new Error('getaddrinfo ENOTFOUND api.github.com');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname === '/user') return json({ login: 'octo-dev' });
    let m = url.pathname.match(/^\/repos\/o\/r\/issues\/(\d+)\/comments$/);
    if (m && method === 'GET') return json(comments);
    if (m && method === 'POST') {
      const c = {
        id: comments.length + 1,
        html_url: `https://github.com/o/r/pull/${m[1]}#c${comments.length + 1}`,
        body: body.body,
        user: { login: 'octo-dev' },
      };
      comments.push(c);
      return json(c, 201);
    }
    m = url.pathname.match(/^\/repos\/o\/r\/issues\/comments\/(\d+)$/);
    if (m && method === 'PATCH') {
      const c = comments.find((x) => x.id === Number(m![1]))!;
      c.body = body.body;
      return json(c);
    }
    m = url.pathname.match(/^\/repos\/o\/r\/statuses\/([0-9a-f]+)$/);
    if (m && method === 'POST') return (statuses.push({ sha: m[1], ...body }), json({}, 201));
    return json({ message: 'Not Found' }, 404);
  };
  return { comments, statuses, calls, fetch, setDown: (v: boolean) => (down = v) };
}

const publisherOf = (gh: ReturnType<typeof fakeGitHub>) =>
  new GitHubProofPublisher({ repo: 'o/r', token: 'ghp_x', fetch: gh.fetch, sleep: async () => {}, retries: 0 });

test('the publisher edits only its own proof comment, and sets the Teamtrail proof status', async () => {
  const gh = fakeGitHub();
  gh.comments.push({
    id: 99,
    html_url: 'x',
    body: '<!-- teamtrail:proof v1 sha256:forged -->',
    user: { login: 'mallory' },
  });
  const p = publisherOf(gh);
  const first = await p.upsertComment(4, '<!-- teamtrail:proof v1 sha256:a -->\nfirst');
  const again = await p.upsertComment(4, '<!-- teamtrail:proof v1 sha256:b -->\nsecond');
  assert.equal(first.url, again.url);
  assert.equal(gh.comments.length, 2, "another account's marker comment is left alone");
  assert.match(gh.comments[1].body, /second/);
  assert.equal(gh.comments[0].body, '<!-- teamtrail:proof v1 sha256:forged -->');
  await p.setStatus(SHA_A, { state: 'success', description: 'ok', targetUrl: first.url });
  assert.deepEqual(gh.statuses[0], {
    sha: SHA_A,
    state: 'success',
    description: 'ok',
    context: 'Teamtrail proof',
    target_url: first.url,
  });
  await assert.rejects(p.setStatus('main', { state: 'success', description: 'ok' }), /full commit sha/);
});

async function trail() {
  const root = tempFolder('teamtrail-proofpost-');
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(a, {
    title: 'Checkout',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'Free shipping', type: 'execute', body: '' },
      { ref: 'b', title: 'Still open', type: 'execute', body: '' },
    ],
  });
  const [done, open] = tickets;
  const attempt: VerificationAttempt = {
    v: 1,
    id: 'A-1',
    mapId: map.id,
    ticketId: done.id,
    ticketKey: done.key,
    agent: 'claude-01',
    level: 'checks',
    configHash: 'h',
    submittedAt: 1,
    finishedAt: 2,
    resolution: 'done',
    checks: [],
    result: 'pass',
    git: {
      v: 1,
      tree: { toplevel: '/r', head: SHA_A, branch: 'b', fingerprint: 'sha256:0' },
      changed: [],
      stats: { files: 1, add: 1, del: 0 },
      flags: [],
    },
  };
  writeAttempt(root, attempt);
  await a.close(map.id, done.id, 'completed');
  const sync = (ticketId: string, headSha: string, state = 'open') =>
    writeTicketSync(root, {
      v: 1,
      mapId: map.id,
      ticketId,
      ticketKey: '#',
      provider: 'github',
      link: { number: 4, source: 'explicit', at: 0 },
      pr: { number: 4, state, headSha } as TicketSync['pr'],
      checks: [],
      checksSummary: { state: 'none' } as unknown as TicketSync['checksSummary'],
      flags: [],
    });
  sync(done.id, SHA_A);
  sync(open.id, SHA_A);
  return { root, a, mapId: map.id, done, sync };
}

test('a done ticket with an open PR gets its proof once, again when the head moves, and retries after a failure', async () => {
  const { root, a, mapId, done, sync } = await trail();
  const gh = fakeGitHub();
  const env = { root, adapter: a, publisher: publisherOf(gh) };

  const first = await publishProofs(env);
  assert.deepEqual(
    first.map((r) => [r.ticketId, r.state]),
    [[done.id, 'success']],
    'the open ticket gets nothing',
  );
  assert.match(gh.comments[0].body, /^<!-- teamtrail:proof v1 sha256:/);
  assert.match(gh.comments[0].body, /verified\.svg/);
  assert.equal(gh.statuses[0].state, 'success');
  assert.deepEqual(await publishProofs(env), [], 'nothing changed: nothing posted');

  sync(done.id, SHA_B);
  gh.setDown(true);
  const failed = await publishProofs(env);
  assert.match(failed[0].error ?? '', /ENOTFOUND/);
  gh.setDown(false);
  const retried = await publishProofs(env);
  assert.equal(retried[0].state, 'failure', "the PR's head isn't the commit Teamtrail verified");
  assert.match(gh.statuses.at(-1)!.description, /commits Teamtrail didn't verify/);
  assert.equal(gh.comments.length, 1, 'the same comment, edited');
  assert.equal(readProofPost(root, mapId, done.id)?.error, undefined);

  sync(done.id, SHA_B, 'merged');
  assert.deepEqual(await publishProofs(env), [], 'a merged PR is left as it is');
});
