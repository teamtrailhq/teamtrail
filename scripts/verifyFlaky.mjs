// Flaky checks, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo: `npm test` passes only while
// a flag file outside the repo exists, so it fails and passes on the same code (a flaky test). The agent's completion
// fails, the agent closes again with no change and the test passes: the flaky gate holds that pass for the trail lead.
// The queue says why; the trail lead opens the ticket and accepts the pass with a reason; the ticket is done and its
// proof says the check passed on retry. Trail stats lists the flaky check.
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
import { stopProcess } from './stopProcess.mjs';

const REASON = 'CI clock skew, tracked separately';

/** A git repo whose `npm test` passes only while `flag` (outside the repo) exists. */
function scratchRepo(flag) {
  const top = e2eTemp('teamtrail-flaky-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  const test = `node -e "const ok = require('fs').existsSync(${JSON.stringify(flag).replace(/"/g, "'")}); if (!ok) console.log('not ok 1 - feed lists releases'); process.exit(ok ? 0 : 1)"`;
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ private: true, scripts: { test } }, null, 2));
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

/** Claims a ticket once the run of the checks on main lets implementation start. */
async function claimOnceMainRan(call, args = {}) {
  for (let i = 0; ; i++) {
    try {
      return await call('claim_ticket', args);
    } catch (e) {
      if (i > 120 || !/on main/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/** The ticket held as flaky, accepted in the Lookout: the bubble, the form, the proof. */
async function acceptInLookout(page, shots) {
  const item = (await openNeedsList(page)).locator('li.att-item.k-blocked', { hasText: 'Passed only on retry' });
  await item.waitFor({ timeout: 20_000 });
  await item.locator('.ds-row-main').click();
  await page.locator('.bubble .bubble-need', { hasText: 'Passed only on retry' }).waitFor({ timeout: 15_000 });
  if (shots) await page.screenshot({ path: path.join(shots, 'flaky-held.png') });
  await ticketAction(page, 'Accept the pass…');
  const form = page.locator('form.inline-form');
  await form.getByLabel('Why the pass counts').fill(REASON);
  await form.getByRole('button', { name: 'Accept the pass' }).click();
  await page.locator('.bubble .bubble-bar', { hasText: 'done' }).waitFor({ timeout: 20_000 });
  await openFullTicket(page);
  const proof = page.locator('.ticket-drawer .ticket-proof', { hasText: 'Verified by Teamtrail' });
  await proof.waitFor({ timeout: 15_000 });
  return proof.getByText(/test passed on retry/).isVisible();
}

/** Trail stats → Flaky checks lists the check, its failing test and the ticket. */
async function flakyInTrailStats(page, key, shots) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Records/ }).click();
  await page.locator('.stats-btn').click();
  const row = page.locator('.flaky-checks .perf-row', { hasText: 'test · feed lists releases' });
  const shown = await row.waitFor({ timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  if (shots) await page.screenshot({ path: path.join(shots, 'flaky-stats.png') });
  return shown && (await row.getByText(key).isVisible());
}

export async function verifyFlaky({ browser, cli, log, shots }) {
  const flag = path.join(e2eTemp('teamtrail-flaky-flag-'), 'pass');
  fs.writeFileSync(flag, '');
  const top = scratchRepo(flag);
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
      tickets: [
        { ref: 'rss', title: 'Add the RSS feed', type: 'task' },
        { ref: 'atom', title: 'Add the Atom feed', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    // the checks pass on main; then the test turns flaky
    const claimed = await claimOnceMainRan(one.call);
    const key = claimed.claimed.key;
    fs.writeFileSync(path.join(top, 'feed.xml'), '<rss/>');
    fs.rmSync(flag);
    const failed = await one.call('close_ticket', { ticket: key, resolution: 'Added /feed.xml' });
    // the same code, closed again: this time the test passes
    fs.writeFileSync(flag, '');
    await one.call('claim_ticket', { ticket: key });
    const held = await one.call('close_ticket', { ticket: key, resolution: 'Added /feed.xml' });
    const told = (held.note ?? '').includes('A retry is not a fix');
    const proofShown = await acceptInLookout(page, shots);
    const report = await one.call('proof_report', { ticket: key });
    const retried = /passed on retry: it failed in A\\-1 .* the trail lead accepted the pass/.test(
      report.markdown ?? '',
    );
    const inList = await flakyInTrailStats(page, key, shots);
    const ok = failed.status === 'rework' && held.status === 'blocked' && told && proofShown && retried && inList;
    log(
      `flaky checks ${ok ? 'ok' : 'WRONG'}: ${key} ${failed.status} then ${held.status} on unchanged code (agent told ${told}), accepted the pass in the Lookout, proof ${proofShown ? 'says passed on retry' : 'MISSING passed on retry'}, proof_report ${retried ? 'ok' : 'WRONG'}, Trail stats ${inList ? 'lists it' : 'does NOT list it'}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok && !errors.length;
  } finally {
    await one.client.close();
    await page.close();
    await stopProcess(lookout.proc);
    if (!process.env.KEEP) {
      fs.rmSync(top, { recursive: true, force: true });
      fs.rmSync(path.dirname(flag), { recursive: true, force: true });
    }
  }
}
