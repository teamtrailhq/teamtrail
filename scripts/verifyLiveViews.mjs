// Live views (verify-mcp.mjs), on a scratch repo: what changes outside the watched tracker folder still reaches an
// open page without a reload.
//   1. An approval made in a second browser (Settings → Approvals) updates the first, which shows the risk policy:
//      approvals live in this machine's store, and the server sends a `trust` event when it changes.
//   2. Evidence alone changing (no ticket file touched) moves the map card's check mark: the server sends it as a
//      `verification` event, never as a path.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { answeringChecklists, approveSkipInLookout, lookoutLinks, pairLink, signInWith } from './e2eHelpers.mjs';

const LIVE_MS = 10_000;

/** A git repo whose checks pass, with a committed risk policy that lowers Dependencies (medium by default) to low. */
function scratchRepo() {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-live-e2e-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  const test = `node -e "process.exit(0)"`;
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ private: true, scripts: { test } }, null, 2));
  const dir = path.join(top, '.teamtrail');
  fs.mkdirSync(dir);
  const config = { v: 1, default: 'checks', maxAttempts: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] };
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(config, null, 2));
  const categories = {
    schema: 'high',
    'breaking-api': 'high',
    'auth-permissions': 'high',
    billing: 'high',
    'data-deletion': 'high',
    'product-behaviour': 'medium',
    dependencies: 'low',
  };
  fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify({ v: 1, categories, paths: [] }, null, 2));
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

const settingsUrl = (url, section) => `${url}${url.includes('?') ? '&' : '?'}settings=${section}`;

/** Past the first-run dialog, when this browser shows it. */
async function pastOnboarding(page) {
  const start = page.getByRole('button', { name: 'Get started' });
  await start.waitFor({ timeout: 5_000 }).catch(() => {});
  if (await start.isVisible()) await start.click();
  await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
}

/** Approves one row of Settings → Approvals. */
async function approveRow(page, text) {
  const row = page.locator('.ap-row', { hasText: text });
  await row.waitFor({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Approve' }).click();
  await row.waitFor({ state: 'detached', timeout: 15_000 });
}

/** Whether `locator` reaches `state` within the live window, without the page reloading. */
const within = (locator, state) =>
  locator.waitFor({ state, timeout: LIVE_MS }).then(
    () => true,
    () => false,
  );

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

/** 1. The risk policy in the first browser follows an approval made in the second. */
async function approvalReachesOtherPage({ first, second, url, cli, top }) {
  await first.goto(settingsUrl(url, 'policy'));
  await pastOnboarding(first);
  const level = first.locator('button[aria-label="Dependencies risk"] .select-value');
  await level.filter({ hasText: 'Medium' }).waitFor({ timeout: 15_000 });
  let reloaded = false;
  first.on('load', () => (reloaded = true));
  await signInWith(second, pairLink({ cli, cwd: top }));
  await second.goto(settingsUrl(url, 'approvals'));
  await pastOnboarding(second);
  await approveRow(second, 'Risk policy lowers what needs you');
  await approveRow(second, 'Check commands in verification.json');
  const live = await within(level.filter({ hasText: 'Low' }), 'visible');
  return { ok: live && !reloaded, live, reloaded };
}

/** 2. A done, verified ticket's check mark goes when its evidence goes, and comes back with it. */
async function evidenceMovesCheckMark({ page, url, one, top }) {
  const started = await one.call('start_trail', {
    discovery: false,
    title: 'Feeds',
    destination: 'Readers subscribe to releases',
    // two, so the first done doesn't finish the trail (and open Destination reached over the map)
    tickets: [
      { ref: 'rss', title: 'Add the RSS feed', type: 'task' },
      { ref: 'atom', title: 'Add the Atom feed', type: 'task' },
    ],
  });
  await approveSkipInLookout({ started, page, url });
  const claimed = await claimOnceMainRan(one.call);
  const closed = await one.call('close_ticket', { ticket: claimed.claimed.key, resolution: 'Added /feed.xml' });
  await page.goto(url);
  const card = page.locator('.node', { hasText: 'Add the RSS feed' });
  const mark = card.locator('.dot-verified');
  await mark.waitFor({ timeout: 20_000 });
  const ticketId = claimed.claimed.id ?? claimed.claimed.key.replace('#', '');
  const safe = (s) => s.replace(/[^\w.-]/g, '_');
  const dir = path.join(top, '.teamtrail', '.evidence', safe(started.trail.id), safe(ticketId));
  const aside = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-live-evidence-'));
  const attempts = fs.readdirSync(dir).filter((n) => /^A-\d+\.json$/.test(n));
  for (const n of attempts) fs.renameSync(path.join(dir, n), path.join(aside, n));
  const gone = await within(mark, 'detached');
  for (const n of attempts) fs.copyFileSync(path.join(aside, n), path.join(dir, n));
  const back = await within(mark, 'visible');
  fs.rmSync(aside, { recursive: true, force: true });
  return { ok: closed.status === 'done' && gone && back, status: closed.status, gone, back };
}

export async function verifyLiveViews({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const lookout = await startLookout(cli, top);
  const first = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const second = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  for (const p of [first, second]) p.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  try {
    await signInWith(first, lookout.pair);
    const approval = await approvalReachesOtherPage({ first, second, url: lookout.url, cli, top });
    if (shots) await first.screenshot({ path: path.join(shots, 'live-policy-approved-elsewhere.png') });
    const evidence = await evidenceMovesCheckMark({ page: first, url: lookout.url, one, top });
    const ok = approval.ok && evidence.ok && !errors.length;
    log(
      `live views ${ok ? 'ok' : 'WRONG'}: an approval in a second browser ${approval.live ? 'reached' : 'did NOT reach'} the first's risk policy${approval.reloaded ? ' (it reloaded)' : ''}; evidence alone ${evidence.gone ? 'took' : 'did NOT take'} the check mark off the done ticket (${evidence.status}) and ${evidence.back ? 'put it back' : 'did NOT put it back'}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await first.close();
    await second.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
