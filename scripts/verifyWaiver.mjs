// Accept without a check, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo: verification.json
// asks for `npm test`, which passes on main but can't pass once the work adds feed.xml (say, a suite nobody can run
// against it yet). The agent's completion is held; the
// queue's item says the way out; the trail lead opens the ticket, accepts it without `test` with a reason, and the
// ticket is done, its proof not verified and saying who skipped the check and why. Undo puts the check back.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  answeringChecklists,
  approveSkipInLookout,
  lookoutLinks,
  openFullTicket,
  openNeedsList,
  sessionHeaders,
  signInWith,
  ticketAction,
} from './e2eHelpers.mjs';

const REASON = 'This repo has no test runner yet; the change was checked by hand';

/** A git repo whose `npm test` passes on main and fails once feed.xml is there. */
function scratchRepo() {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-waive-e2e-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  const test = `node -e "process.exit(require('fs').existsSync('feed.xml') ? 1 : 0)"`;
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ private: true, scripts: { test } }, null, 2));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const config = { v: 1, default: 'checks', maxAttempts: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] };
  fs.writeFileSync(path.join(top, '.teamtrail', 'verification.json'), JSON.stringify(config, null, 2));
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

async function startLookout(cli, cwd) {
  const proc = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd });
  const links = await new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', (c) => {
      out += c;
      const found = lookoutLinks(out);
      if (found) resolve(found);
    });
    proc.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { proc, ...links };
}

async function agent(cli, cwd) {
  // the whole environment: the SDK's default would leave out this run's config dir and use the real one
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
  // a scripted agent that answers its guides' checklists, as one would
  return { client, call: answeringChecklists(call) };
}

/** The first run on this machine: the check command approved once in Settings → Approvals. */
async function approveChecks(page, url) {
  await page.locator('.dialog.onboarding').waitFor();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  const again = page.getByRole('button', { name: 'Get started' });
  if (await again.isVisible()) await again.click();
  await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
  await page.goto(url);
}

/** Claims the next ticket once the run of the checks on main lets implementation start. */
async function claimOnceMainRan(call) {
  for (let i = 0; ; i++) {
    try {
      return await call('claim_ticket', {});
    } catch (e) {
      if (i > 120 || !/on main/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export async function verifyWaiver({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  try {
    await signInWith(page, lookout.pair);
    await approveChecks(page, lookout.url);
    const started = await one.call('start_trail', {
      discovery: false,
      title: 'Feeds',
      destination: 'Readers subscribe to releases',
      // two, so the first done doesn't finish the trail (and open Destination reached over the inspector)
      tickets: [
        { ref: 'rss', title: 'Add the RSS feed', type: 'task' },
        { ref: 'atom', title: 'Add the Atom feed', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    // implementation waits until the checks have run once on main (they pass there)
    const claimed = await claimOnceMainRan(one.call);
    const key = claimed.claimed.key;
    fs.writeFileSync(path.join(top, 'feed.xml'), '<rss/>');
    const held = await one.call('close_ticket', { ticket: key, resolution: 'Added /feed.xml' });
    // the queue says the way out, and opens the ticket
    const item = (await openNeedsList(page)).locator('li.att-item.k-blocked', { hasText: 'accept it without test' });
    await item.waitFor({ timeout: 20_000 });
    await item.locator('.ds-row-main').click();
    const standing = page.locator('.bubble .bubble-need', { hasText: 'Blocked' });
    await standing.waitFor({ timeout: 15_000 });
    await ticketAction(page, 'Accept without test…');
    const form = page.locator('.waive-form');
    await form.getByLabel('Why it can go without test').fill(REASON);
    if (shots) await page.screenshot({ path: path.join(shots, 'waive-form.png') });
    await form.getByRole('button', { name: 'Accept without test' }).click();
    await page.locator('.bubble .ticket-chips .tag-state', { hasText: 'done' }).waitFor({ timeout: 20_000 });
    await openFullTicket(page);
    const proofPanel = page.locator('.ticket-drawer .ticket-proof', { hasText: 'Not verified' });
    await proofPanel.waitFor({ timeout: 15_000 });
    const gapShown = await proofPanel.getByText(/test didn't run: .+ accepted the work without it\./).isVisible();
    const accepted = page.locator('.ticket-drawer .fact', { hasText: 'Skipped' });
    const reasonShown = await accepted.getByText(REASON).isVisible();
    if (shots) await page.screenshot({ path: path.join(shots, 'waived-done.png') });
    const report = await one.call('proof_report', { ticket: key });
    const skipped = /skipped by .+: This repo has no test runner yet/.test(report.markdown ?? '');
    // Undo: the check runs again, and the ticket that closed on it goes back in the queue
    await accepted.getByRole('button', { name: 'Undo' }).click();
    await accepted.waitFor({ state: 'detached', timeout: 15_000 });
    const ticketId = claimed.claimed.id ?? key.replace('#', '');
    const api = new URL(`/__teamtrail/verification/ticket?mapId=${started.trail.id}&ticketId=${ticketId}`, lookout.url);
    const after = await (await page.request.get(api.href, { headers: await sessionHeaders(page) })).json();
    const undone = !after.waivers?.length;
    const ok = held.status === 'blocked' && gapShown && reasonShown && skipped && undone && !errors.length;
    log(
      `accept without a check ${ok ? 'ok' : 'WRONG'}: ${key} ${held.status} on npm test, the queue offered the way out, accepted without test with a reason, done and not verified (gap ${gapShown}, reason ${reasonShown}, proof_report ${skipped ? 'says skipped by' : 'MISSING skipped'}), Undo ${undone ? 'put it back' : 'did NOT'}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
