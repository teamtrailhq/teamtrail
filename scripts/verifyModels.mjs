// M5 model-aware claiming steps of the end-to-end check (verify-mcp.mjs), on their own scratch project: two agents
// whose Claude Code transcripts show different models, the trail lead switching model matching on in the Lookout,
// research reaching the fast session and the junction the strong one, the strong session taking research when nothing
// else is ready, a junction waiting for a strongest model once the strong agent leaves, and an explicit claim of it
// succeeding with a tierNote. Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function startServer(cli, cwd) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const m = out.match(/Lookout\s+(http:\S+)/);
      if (m) resolve(m[1]);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, url };
}

/** An agent as Claude Code runs it: every call is logged first in its own transcript, by `model`. */
async function agent({ cli, top, config, name, model }) {
  const transcript = path.join(config, 'projects', top.replace(/[^a-zA-Z0-9]/g, '-'), `${name}.jsonl`);
  fs.mkdirSync(path.dirname(transcript), { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd: top,
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_PROJECT_DIR: top },
  });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  let seq = 0;
  const call = async (tool, args = {}) => {
    const id = `toolu_${name}_${Date.now().toString(36)}_${seq++}`;
    const message = {
      id: `msg_${name}_${seq}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'tool_use', id, name: `mcp__teamtrail__${tool}`, input: args }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const line = { type: 'assistant', timestamp: new Date().toISOString(), requestId: `req_${name}_${seq}`, message };
    fs.appendFileSync(transcript, `${JSON.stringify(line)}\n`);
    const r = await client.callTool({ name: tool, arguments: args, _meta: { 'claudecode/toolUseId': id } });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

const refused = (p) =>
  p.then(
    () => '',
    (e) => e.message,
  );

/** The trail lead turns model matching on in Settings; the trail's map.md says so. */
async function switchOn({ page, top, shot }) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.model-matching-toggle').click();
  await page.locator('.tier-grid').waitFor({ timeout: 15_000 });
  await page.locator('.tier-grid').scrollIntoViewIfNeeded();
  await shot('17-model-matching-settings');
  // Settings is a page with its place in the URL: another group replaces it, the browser's Back returns to the Lookout
  await page
    .locator('.sp-nav')
    .getByRole('button', { name: /^Project/ })
    .click();
  await page.waitForURL(/[?&]settings=project\b/);
  await page.locator('.sp-nav button[aria-current="page"]', { hasText: 'Project' }).waitFor();
  await page.goBack();
  await page.locator('.settings-page').waitFor({ state: 'detached' });
  await page.goForward();
  await page.locator('.settings-page').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.settings-page').waitFor({ state: 'detached' });
  const dir = fs.readdirSync(path.join(top, '.teamtrail')).find((d) => d.startsWith('release-search'));
  return /^model-matching: on$/m.test(fs.readFileSync(path.join(top, '.teamtrail', dir, 'map.md'), 'utf8'));
}

async function matching({ fast, strong, page, shot }) {
  const j = await strong.call('claim_ticket');
  const r = await fast.call('claim_ticket');
  const fallback = await strong.call('claim_ticket');
  await page.locator('.sessions-list .session-tier', { hasText: 'strongest' }).first().waitFor({ timeout: 20_000 });
  await page.locator('.sessions-list .session-tier', { hasText: 'fast' }).first().waitFor({ timeout: 20_000 });
  await shot('18-session-tiers');
  return {
    ok:
      j.claimed.type === 'junction' &&
      j.tier?.session === 'strongest' &&
      r.claimed.type === 'research' &&
      r.tier?.session === 'fast' &&
      fallback.claimed.type === 'research',
    text: `strong took ${j.claimed.type} (${j.tier?.session}), fast took ${r.claimed.type} (${r.tier?.session}), strong then took ${fallback.claimed.type}`,
  };
}

/** With the strong agent gone, a new junction waits for a strongest model; an explicit claim still takes it. */
async function waiting({ fast, strong, page, shot }) {
  await strong.client.close();
  const added = await fast.call('add_ticket', { title: 'Pick the ranking rule', type: 'junction' });
  const item = page.locator('.attention-queue li.att-item.k-model');
  await item.waitFor({ timeout: 20_000 });
  const title = (await item.textContent()) ?? '';
  await item.click();
  await page.locator('.model-wait').waitFor({ timeout: 15_000 });
  await shot('19-needs-a-strongest-model');
  const next = await fast.call('next_ticket');
  const auto = await refused(fast.call('claim_ticket'));
  const explicit = await fast.call('claim_ticket', { ticket: added.ticket.key });
  await item.waitFor({ state: 'detached', timeout: 20_000 });
  return {
    ok:
      /needs a strongest model/.test(title) &&
      next.ticket === null &&
      /stronger model/.test(auto) &&
      explicit.claimed.key === added.ticket.key &&
      /set for strongest; this session runs fast/.test(explicit.tierNote ?? ''),
    text: `queue "${title.slice(0, 60)}", next_ticket null, auto claim refused, explicit claim note: ${explicit.tierNote}`,
  };
}

export async function verifyModels({ browser, cli, log, shots }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-models-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const config = path.join(top, '.claude-config');
  const { server, url } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => {
    await page.waitForTimeout(500);
    if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
  };
  const fast = await agent({ cli, top, config, name: 'fast', model: 'claude-haiku-4-5' });
  const strong = await agent({ cli, top, config, name: 'strong', model: 'claude-opus-4-1' });
  try {
    await page.goto(url);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    await fast.call('start_trail', {
      discovery: false,
      title: 'Release search',
      destination: 'Readers find a release in seconds',
      tickets: [
        { ref: 'size', title: 'Survey release sizes', type: 'research' },
        { ref: 'format', title: 'Pick the index format', type: 'junction' },
        { ref: 'years', title: 'Count releases per year', type: 'research' },
      ],
    });
    await page.locator('.node', { hasText: 'Pick the index' }).first().waitFor({ timeout: 15_000 });
    const on = await switchOn({ page, top, shot });
    const matched = await matching({ fast, strong, page, shot });
    const waited = await waiting({ fast, strong, page, shot });
    const ok = on && matched.ok && waited.ok && !errors.length;
    log(
      `model matching ${ok ? 'ok' : 'WRONG'}: switched on in Settings (${on}); ${matched.text}; ${waited.text}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await fast.client.close();
    await strong.client.close().catch(() => undefined);
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
