// Escapes, end to end (verify-mcp.mjs), on a scratch git repo: an agent commits its work on main and completes it,
// the check passes and the ticket is done; then the commit is reverted on main. The Lookout asks "#1 was verified,
// then reverted: add a rule?", the item opens Settings with the rule prefilled (`when`, `why`), and the scorecard's
// Came back view lists it with the check that passed. Waits on what the user sees, never on sleeps.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { answeringChecklists, approveSkipInLookout, lookoutLinks, openNeedsList, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=e2e@teamtrail', '-c', 'user.name=e2e', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

function scratchRepo() {
  const top = path.join(e2eTemp('teamtrail-escapes-e2e-'), 'app');
  fs.mkdirSync(path.join(top, '.teamtrail'), { recursive: true });
  fs.mkdirSync(path.join(top, 'src', 'forms'), { recursive: true });
  fs.writeFileSync(path.join(top, 'check.js'), "console.log('ok');\n");
  fs.writeFileSync(path.join(top, '.gitignore'), '.teamtrail\n');
  fs.writeFileSync(
    path.join(top, '.teamtrail', 'verification.json'),
    JSON.stringify({ v: 1, default: 'checks', checks: { test: { run: ['node', 'check.js'] } }, run: ['test'] }),
  );
  git(top, 'init', '-q', '-b', 'main');
  git(top, 'add', '-A');
  git(top, 'commit', '-qm', 'init');
  return top;
}

async function startServer(cli, cwd) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env: { ...process.env } });
  const links = await new Promise((resolve, reject) => {
    let out = '';
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
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    stderr: 'pipe',
    env: { ...process.env },
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

/** The first run: Get started, then the check commands approved in Settings → Approvals. */
async function firstRun(page, url) {
  await page.locator('.dialog.onboarding').waitFor();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  const again = page.getByRole('button', { name: 'Get started' });
  if (await again.isVisible()) await again.click();
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
  await page.goto(url);
}

/** Claims the login task, commits the change on main and completes it: verified by the passing check. */
async function verifiedLogin(call, page, url, top) {
  const started = await approveSkipInLookout({
    started: await call('start_trail', {
      discovery: false,
      title: 'Login',
      destination: 'People sign in',
      tickets: [{ ref: 'login', title: 'Add the login form', type: 'task' }],
    }),
    page,
    url,
  });
  // the trail is ready for work: the checks run on main first, and the task waits until they pass there
  await page.locator('.node.main-mark.main-passed').waitFor({ timeout: 20_000 });
  const t = { key: started.tickets[0].key, trail: started.trail.id };
  await call('claim_ticket', { ticket: t.key, trail: t.trail });
  fs.writeFileSync(path.join(top, 'src', 'forms', 'login.js'), 'export const login = () => true;\n');
  git(top, 'add', 'src/forms/login.js');
  git(top, 'commit', '-qm', 'Add the login form');
  const done = await call('close_ticket', { resolution: 'Added the login form', ticket: t.key, trail: t.trail });
  return { ...t, done };
}

/**
 * Trail stats → Scorecard → Came back: the reverted ticket, with the check that passed on it. Clicked while the
 * Lookout is still loading, as a person might: what opens on its own (the escape's rule in Settings) must not cover it.
 */
async function cameBackRow(page, key) {
  await page.getByRole('button', { name: /^Records/ }).click();
  await page.locator('.stats-btn').click();
  const card = page.locator('.scorecard');
  await card.getByRole('button', { name: 'Came back' }).click();
  const row = card.locator('.score-row', { hasText: `${key} reverted` });
  await row.waitFor({ timeout: 15_000 });
  return /passed test/.test((await row.textContent()) ?? '');
}

export async function verifyEscapes({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const { server, url, pair } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  try {
    await signInWith(page, pair);
    await firstRun(page, url);
    const login = await verifiedLogin(one.call, page, url, top);
    git(top, 'revert', '--no-edit', 'HEAD');
    // the trail is done: Destination reached opens once; closed as a person would
    const reached = page.getByRole('dialog', { name: 'Destination reached' });
    await reached.waitFor({ timeout: 15_000 }).then(
      () => reached.getByRole('button', { name: 'Close' }).click(),
      () => {},
    );

    const item = (await openNeedsList(page)).locator('li.att-item.k-escape');
    await item.waitFor({ timeout: 30_000 });
    const asked = (await item.textContent())?.includes(`${login.key} was verified, then reverted: add a rule?`);
    if (shots) await page.screenshot({ path: path.join(shots, '19-escape-item.png') });
    await item.locator('.ds-row-main').click();
    await page.waitForURL(/[?&]when=/, { timeout: 15_000 });
    const params = new URL(page.url()).searchParams;
    const prefilled =
      ['rules', 'verification'].includes(params.get('settings') ?? '') &&
      params.get('when') === 'src/forms/**' &&
      params.get('why') === `${login.key} was verified, then reverted`;
    await page.goto(url);
    const listed = await cameBackRow(page, login.key);
    if (shots) await page.screenshot({ path: path.join(shots, '20-scorecard-came-back.png') });

    const ok = login.done.status === 'done' && asked && prefilled && listed && !errors.length;
    log(
      `escapes ${ok ? 'ok' : 'WRONG'}: ${login.key} ${login.done.status}, reverted on main → item asked (${asked}), rule prefilled ${params.get('when')} (${prefilled}), scorecard Came back lists it (${listed})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
