// Remote agents steps of the end-to-end check (verify-mcp.mjs), on their own scratch project: the MCP endpoint is
// closed until the trail lead creates a token in Settings → Project → Remote agents; a client then connects over streamable
// HTTP to the Lookout's /mcp and to `teamtrail mcp --http`, shares the trail with a stdio agent, claims and closes
// a ticket the Lookout shows; revoking the token in the Lookout cuts the client off. Waits on what the user sees
// and on what the server answers, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { shootThemes, signInWith } from './e2eHelpers.mjs';

/** Starts the built CLI and resolves once its output names the URL it serves. */
async function start(cli, args, cwd, pattern) {
  const proc = spawn(process.execPath, [cli, ...args], { cwd });
  const { url, pair } = await new Promise((resolve, reject) => {
    let out = '';
    const read = (c) => {
      out += c;
      const m = out.match(pattern);
      // the Lookout also prints its one-time sign-in link; wait for it too
      const link = out.match(/Sign in\s+(http:\S+)/)?.[1];
      if (m && (link || !/Lookout/.test(pattern.source))) resolve({ url: m[1], pair: link });
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', read);
    proc.on('exit', (code) => reject(new Error(`teamtrail ${args.join(' ')} exited ${code}: ${out}`)));
  });
  return { proc, url, pair };
}

const caller =
  (client) =>
  async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };

/** An agent on "another machine": an MCP client over streamable HTTP with its token in the Authorization header. */
async function httpAgent(endpoint, token) {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  return { client, transport, call: caller(client) };
}

/** What the endpoint answers to an initialize with this token: the HTTP status. */
async function knock(endpoint, token, session) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(session ? { 'Mcp-Session-Id': session } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: session ? 'tools/list' : 'initialize',
      params: session
        ? {}
        : { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'knock', version: '1' } },
    }),
  });
  await r.body?.cancel().catch(() => {});
  return r.status;
}

async function until(what, ok, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await ok()) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The trail lead creates a token in Settings; returns it as the page shows it, once. */
async function createToken({ page, section, name, shots }) {
  await section.getByLabel('Agent name').fill(name);
  await section.getByRole('button', { name: 'Create token' }).click();
  await section.getByText(`Token for ${name}`).waitFor({ timeout: 15_000 });
  const token = (await section.locator('[aria-label="Token"]').textContent()) ?? '';
  const command = (await section.locator('[aria-label="Connect command"]').textContent()) ?? '';
  await section.scrollIntoViewIfNeeded();
  await shootThemes(page, shots, '30-remote-agents-token');
  await section.getByRole('button', { name: "I've copied it" }).click();
  await section.getByText(`Token for ${name}`).waitFor({ state: 'detached' });
  return { token, command };
}

export async function verifyRemote({ browser, cli, log, shots }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-remote-e2e-'));
  const root = path.join(top, '.teamtrail');
  fs.mkdirSync(root);
  const lookout = await start(cli, ['--no-open', '--port', '0'], top, /Lookout\s+(http:\S+)/);
  const endpoint = `${lookout.url}mcp`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const closers = [];
  try {
    // Nothing is reachable before the trail lead creates a token.
    const closed = [await knock(endpoint), await knock(endpoint, 'tt_made-up')];

    // A stdio agent starts the trail, as today.
    const stdio = new Client({ name: 'claude-code', version: '2.1.0' });
    await stdio.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cli, 'mcp'],
        cwd: top,
        stderr: 'pipe',
        env: { ...process.env },
      }),
    );
    closers.push(() => stdio.close());
    const local = caller(stdio);
    const trail = await local('start_trail', {
      discovery: false,
      title: 'Remote docs',
      destination: 'The docs build from any machine',
      tickets: [
        { ref: 'a', title: 'Survey the docs toolchain', type: 'research' },
        { ref: 'b', title: 'List the pages to move', type: 'research' },
      ],
    });
    const mine = await local('claim_ticket', { ticket: trail.tickets[0].key });

    await signInWith(page, lookout.pair);
    await page.goto(`${lookout.url}?settings=remote-agents`);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    const section = page.locator('#settings-remote-agents');
    await section.getByText('No tokens, so the endpoint is closed').waitFor({ timeout: 15_000 });
    await section.getByText(endpoint).waitFor();
    const { token, command } = await createToken({ page, section, name: 'cloud sandbox', shots });
    // The command never carries the token, and is never built from the Lookout's own port.
    const commandOk =
      !command.includes(token) &&
      !command.includes(endpoint) &&
      command.includes('read -rs TEAMTRAIL_TOKEN && export TEAMTRAIL_TOKEN') &&
      command.includes('connect claude --url <endpoint>');
    const onDisk = fs.readFileSync(path.join(root, '.agents', 'remote-tokens.json'), 'utf8');

    // `teamtrail mcp --http`: the same tools on a port of their own, announced in Settings, and nothing else on it.
    const alone = await start(cli, ['mcp', '--http', '--port', '0'], top, /Endpoint\s+(http:\S+)/);
    closers.push(() => alone.proc.kill('SIGTERM'));
    await section.getByText(alone.url).waitFor({ timeout: 15_000 });
    const elsewhere = await fetch(alone.url.replace(/\/mcp$/, '/__teamtrail/list'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    // The remote agent connects to the Lookout's endpoint, and a second session to the standalone one.
    const remote = await httpAgent(endpoint, token);
    closers.push(() => remote.client.close().catch(() => undefined));
    const second = await httpAgent(alone.url, token);
    closers.push(() => second.client.close().catch(() => undefined));
    const taken = await remote.call('claim_ticket');
    const stolen = await remote.call('claim_ticket', { ticket: mine.claimed.key }).then(
      () => '',
      (e) => e.message,
    );
    await page.keyboard.press('Escape');
    await page.locator('.settings-page').waitFor({ state: 'detached' });
    await page
      .locator('.sessions-list li:not(.claim)', { hasText: taken.claimed.assignee })
      .first()
      .waitFor({ timeout: 20_000 });
    if (shots) await page.screenshot({ path: path.join(shots, '31-remote-agent-working.png') });
    // The remote agent can't be the human's voice: no answer_question in its tools, and its own question stays open.
    const remoteTools = (await remote.client.listTools()).tools.map((t) => t.name);
    const localTools = (await stdio.listTools()).tools.map((t) => t.name);
    const asked = await remote.call('ask_human', { question: 'Docusaurus or MkDocs?', waitSeconds: 0 });
    const selfAnswer = await remote
      .call('answer_question', { questionId: asked.questionId, answer: 'Docusaurus' })
      .then(
        () => '',
        (e) => e.message,
      );
    const inbox = await second.call('list_inbox');
    const cannotAnswer =
      !remoteTools.includes('answer_question') &&
      localTools.includes('answer_question') &&
      /trail lead's: they answer in the Lookout or Slack/.test(selfAnswer) &&
      inbox.questions.some((q) => q.questionId === asked.questionId);
    const done = await remote.call('close_ticket', { resolution: 'Docusaurus, built in CI' });
    await page.locator('.node.st-decided', { hasText: 'List the pages' }).waitFor({ timeout: 20_000 });

    // Revoked in the Lookout: the live session ends and the token opens nothing any more.
    await page.goto(`${lookout.url}?settings=remote-agents`);
    await section.getByText(/Last used (just now|\d+ min ago)/).waitFor({ timeout: 15_000 });
    await section.getByRole('button', { name: 'Revoke cloud sandbox' }).click();
    await shootThemes(page, shots, '32-remote-agents-revoke');
    await section.getByRole('button', { name: 'Revoke cloud sandbox' }).click();
    await section.getByText('No tokens, so the endpoint is closed').waitFor({ timeout: 15_000 });
    const session = remote.transport.sessionId;
    await until('the revoked session to be refused', async () => (await knock(endpoint, token, session)) === 401);
    const afterRevoke = [await knock(endpoint, token), await knock(alone.url, token)];
    const refused = await remote.call('status').then(
      () => false,
      () => true,
    );
    const journal = fs
      .readFileSync(path.join(root, '.events', '_remote-agents.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).action);

    const ok =
      closed.every((s) => s === 401) &&
      /^tt_[\w-]{43}$/.test(token) &&
      commandOk &&
      !onDisk.includes(token) &&
      elsewhere.status === 404 &&
      taken.claimed.key === trail.tickets[1].key &&
      taken.claimed.assignee !== mine.claimed.assignee &&
      /is claimed/.test(stolen) &&
      cannotAnswer &&
      done.closed === taken.claimed.key &&
      afterRevoke.every((s) => s === 401) &&
      refused &&
      journal.join() === 'token-created,token-revoked' &&
      !errors.length;
    log(
      `remote agents ${ok ? 'ok' : 'WRONG'}: closed before a token (${closed.join(', ')}); token created in Settings, ` +
        `only its hash on disk (${!onDisk.includes(token)}), command shown (${commandOk}); ${taken.claimed.assignee} over HTTP took ` +
        `${taken.claimed.key} next to ${mine.claimed.assignee} on stdio (its ticket refused: "${stolen}"); closed ${done.closed}, shown in the Lookout; ` +
        `its own question could not be answered by it (${cannotAnswer}); mcp --http served ${alone.url} and nothing else (${elsewhere.status}); after Revoke: ${afterRevoke.join(', ')}, ` +
        `client refused (${refused}); journal ${journal.join(' → ')}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    for (const close of closers.reverse()) await Promise.resolve(close()).catch(() => undefined);
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
