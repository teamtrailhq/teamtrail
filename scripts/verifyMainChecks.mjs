// Checks on main, end to end (verify-mcp.mjs), on a scratch git repo whose `test` check already fails on main: the
// run on main fails, the human gets a blocking item, starts anyway in the Lookout, and a completion that fails only in
// that check, the same way, is done and not sent back, its proof marking a known failure. On a second trail the human
// drops the check instead, and completions there stop running it. Waits on what the user sees, never on sleeps.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { answeringChecklists, approveSkipInLookout, lookoutLinks, sessionHeaders, signInWith } from './e2eHelpers.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** `test` fails until title.txt exists, as a real suite's failing test does on main. */
const CHECK = `if (!require('fs').existsSync('title.txt')) {
  console.log('FAIL src/App.test.tsx > should render title');
  process.exit(1);
}`;

function scratchRepo() {
  const top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-main-e2e-')), 'app');
  fs.mkdirSync(path.join(top, '.teamtrail'), { recursive: true });
  fs.writeFileSync(path.join(top, 'check.js'), CHECK);
  fs.writeFileSync(path.join(top, '.gitignore'), '.teamtrail\n');
  fs.writeFileSync(
    path.join(top, '.teamtrail', 'verification.json'),
    JSON.stringify({ v: 1, default: 'checks', checks: { test: { run: ['node', 'check.js'] } }, run: ['test'] }),
  );
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'add', '-A');
  sh(top, '-c', 'user.email=e2e@teamtrail', '-c', 'user.name=e2e', 'commit', '-qm', 'init');
  return top;
}

async function startServer(cli, cwd) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env: { ...process.env } });
  const links = await new Promise((resolve, reject) => {
    let out = '';
    if (process.env.E2E_DEBUG) server.stderr.on('data', (c) => process.stderr.write(c));
    server.stdout.on('data', (c) => {
      out += c;
      const found = lookoutLinks(out);
      if (found) resolve(found);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, ...links };
}

async function agent(cli, cwd) {
  // the whole environment: the test's own config dir, never the user's (the SDK passes only a few variables)
  const env = { ...process.env };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    stderr: 'pipe',
    env,
  });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call: answeringChecklists(call) };
}

/** The first run: the trail lead approves the check commands in Settings → Approvals. */
async function approveChecks(page, url) {
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  const again = page.getByRole('button', { name: 'Get started' });
  if (await again.isVisible()) await again.click();
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
  await page.goto(url);
}

async function trail(call, page, url, title) {
  const started = await approveSkipInLookout({
    started: await call('start_trail', {
      discovery: false,
      title,
      destination: 'The page shows its title',
      tickets: [{ ref: 'build', title: `${title}: the header`, type: 'task' }],
    }),
    page,
    url,
  });
  return { mapId: started.trail.id, key: started.tickets[0].key };
}

/** Claims the trail's task, changes a file that doesn't fix main, and completes it. */
async function complete(call, top, t, file) {
  await call('claim_ticket', { ticket: t.key, trail: t.mapId });
  fs.writeFileSync(path.join(top, file), 'header\n');
  return call('close_ticket', { resolution: 'Added the header', ticket: t.key, trail: t.mapId });
}

export async function verifyMainChecks({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const { server, url, pair } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  try {
    await signInWith(page, pair);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    await approveChecks(page, url);
    const first = await trail(one.call, page, url, 'Title');

    // the claim starts the run on main and waits for it: the check already fails there, so the task waits
    const held = await one.call('next_ticket', { trail: first.mapId, types: ['task'] });
    const waits = /Checks already fail on main \(test\)/.test(held.mainChecks?.waits ?? '') && held.ticket === null;
    const item = page.locator('.attention-queue li.att-item.k-main-checks');
    await item.waitFor({ timeout: 20_000 });
    const blocking = (await item.getAttribute('class'))?.includes('u-blocking');
    await item.click();
    const section = page.locator('.trail-glance .main-checks');
    await section.getByText('test fails on main').waitFor({ timeout: 15_000 });
    if (shots) await page.screenshot({ path: path.join(shots, '17-main-checks-failed.png') });
    await section.getByRole('button', { name: 'Start anyway' }).click();
    await section.getByText('Known failures on main: test').waitFor({ timeout: 15_000 });
    await item.waitFor({ state: 'detached', timeout: 20_000 });
    if (shots) await page.screenshot({ path: path.join(shots, '18-main-checks-known.png') });

    const done = await complete(one.call, top, first, 'header.txt');
    const proof = await one.call('proof_report', { ticket: first.key, trail: first.mapId });
    const known =
      done.status === 'done' &&
      proof.status === 'not-verified' &&
      proof.gaps.some((g) => /Known failures, already failing on main: test/.test(g)) &&
      proof.markdown.includes('known failure, already failing on main');

    // a second trail: the trail lead drops the check for it instead, and its completion no longer runs it
    const second = await trail(one.call, page, url, 'Footer');
    const api = (p) => new URL(`__teamtrail${p}`, url).href;
    const headers = await sessionHeaders(page);
    const before = await (await page.request.get(api(`/main-checks?mapId=${second.mapId}`), { headers })).json();
    const choice = { kind: 'drop', check: 'test' };
    const r = await page.request.post(api('/main-checks/choose'), { headers, data: { mapId: second.mapId, choice } });
    const after = await r.json();
    const dropped = await complete(one.call, top, second, 'footer.txt');
    const dropOk =
      before.state?.kind === 'failed' &&
      after.state?.kind === 'accepted' &&
      after.state.dropped?.[0] === 'test' &&
      dropped.status === 'done';

    const ok = waits && blocking && known && dropOk && !errors.length;
    log(
      `checks on main ${ok ? 'ok' : 'WRONG'}: task held while test fails on main (${waits}), blocking item (${blocking}), Start anyway → ${first.key} ${done.status} with proof ${proof.status} (${known}); dropped for ${second.key}: ${before.state?.kind} → ${after.state?.kind}, ${dropped.status} (${dropOk})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
