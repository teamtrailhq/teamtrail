// The check guard, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo: verification.json asks
// for `npm test`, and the agent's work changes package.json's `test` script, so its pass means nothing. The completion
// is held (the agent is told why); the queue's item and the ticket's bubble say what changed; the trail lead accepts
// the pass with a reason, and the ticket is done, its proof verified and saying who accepted it and why.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  answeringChecklists,
  approveSkipInLookout,
  lookoutLinks,
  openFullTicket,
  openNeedsList,
  signInWith,
  ticketAction,
} from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const REASON = 'The old script ran nothing on Windows; this one is the same suite';
const PASS = `node -e "process.exit(0)"`;

/** A git repo whose `npm test` passes, before and after the work. */
function scratchRepo() {
  const top = e2eTemp('teamtrail-guard-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ private: true, scripts: { test: PASS } }, null, 2));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const config = { v: 1, default: 'checks', checks: { test: { run: ['npm', 'test'] } }, run: ['test'] };
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

export async function verifyCheckGuard({ browser, cli, log, shots }) {
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
      title: 'Tests',
      destination: 'Tests run on every platform',
      // two, so the first done doesn't finish the trail (and open Destination reached over the inspector)
      tickets: [
        { ref: 'win', title: 'Run the tests on Windows', type: 'task' },
        { ref: 'ci', title: 'Run the tests in CI', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    const claimed = await claimOnceMainRan(one.call);
    const key = claimed.claimed.key;
    const pkg = { private: true, scripts: { test: `${PASS} && echo windows` } };
    fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify(pkg, null, 2));
    const held = await one.call('close_ticket', { ticket: key, resolution: 'npm test runs on Windows' });
    const told = held.checkGuard?.findings?.[0]?.what === 'package.json scripts.test changed';
    // the queue says what changed, and opens the ticket
    const item = (await openNeedsList(page)).locator('li.att-item.k-blocked', { hasText: 'scripts.test changed' });
    await item.waitFor({ timeout: 20_000 });
    await item.locator('.ds-row-main').click();
    const standing = page.locator('.bubble .bubble-need', { hasText: 'scripts.test changed' });
    await standing.waitFor({ timeout: 15_000 });
    if (shots) await page.screenshot({ path: path.join(shots, 'check-guard-held.png') });
    await ticketAction(page, 'Accept the pass…');
    const form = page.locator('.inline-form', { hasText: 'Why accept' });
    await form.getByLabel('Why accept').fill(REASON);
    await form.getByRole('button', { name: 'Accept anyway' }).click();
    await page.locator('.bubble .ticket-chips .tag-state', { hasText: 'done' }).waitFor({ timeout: 20_000 });
    await openFullTicket(page);
    const proofPanel = page.locator('.ticket-drawer .ticket-proof', { hasText: 'Verified by Teamtrail' });
    await proofPanel.waitFor({ timeout: 15_000 });
    const acceptedShown = await proofPanel.getByText(/changed what its checks run, accepted by/).isVisible();
    if (shots) await page.screenshot({ path: path.join(shots, 'check-guard-accepted.png') });
    const report = await one.call('proof_report', { ticket: key });
    const onProof = /\*\*Changed what its checks run\*\* \(accepted by .+: The old script ran nothing/.test(
      report.markdown ?? '',
    );
    const ok = held.status === 'blocked' && told && acceptedShown && onProof && !errors.length;
    log(
      `check guard ${ok ? 'ok' : 'WRONG'}: ${key} ${held.status} after changing scripts.test (agent told ${told}), the queue and bubble said what changed, the pass accepted with a reason, done and verified (shown ${acceptedShown}, proof_report ${onProof ? 'says accepted by' : 'MISSING accepted by'})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
