// Trail verified together, end to end (verify-mcp.mjs), on a scratch git repo whose `test` check breaks only when
// a.txt and b.txt are both on main: two tasks each pass alone on their own branch, and the trail waits for their
// merges (Run now offered, clearly labelled). Merged, Teamtrail runs the checks on main by itself and they fail
// together: the destination says so, the trail lead adds a fix ticket, an agent works and merges it, and the next run
// on main verifies the trail together, shown on the Destination reached dialog and the flag and in the trail's proof.
// Waits on what the user sees, never on sleeps.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  answeringChecklists,
  approveSkipInLookout,
  lookoutLinks,
  closeNeedsList,
  openNeedsList,
  signInWith,
} from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const ID = ['-c', 'user.email=e2e@teamtrail', '-c', 'user.name=e2e'];
const sh = (cwd, ...args) => execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8' }).trim();

/** Fails once a.txt and b.txt are both there: each branch passes alone, the two together break. */
const CHECK = `const fs = require('fs');
if (fs.existsSync('a.txt') && fs.existsSync('b.txt')) {
  console.log('FAIL src/Together.test.ts > a and b clash');
  process.exit(1);
}`;

function scratchRepo() {
  const top = path.join(e2eTemp('teamtrail-together-e2e-'), 'app');
  fs.mkdirSync(path.join(top, '.teamtrail'), { recursive: true });
  fs.writeFileSync(path.join(top, 'check.js'), CHECK);
  fs.writeFileSync(path.join(top, '.gitignore'), '.teamtrail\n');
  fs.writeFileSync(
    path.join(top, '.teamtrail', 'verification.json'),
    JSON.stringify({ v: 1, default: 'checks', checks: { test: { run: ['node', 'check.js'] } }, run: ['test'] }),
  );
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'add', '-A');
  sh(top, 'commit', '-qm', 'init');
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

async function approveChecks(page, url) {
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  // the reload can come before onboarding's "done" is saved: dismiss it again rather than race its scrim
  await page
    .getByRole('button', { name: 'Get started' })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
  await page.goto(url);
}

/** An agent's work on its own branch: claim, change `file` (written, or removed with `remove`), commit, close. */
async function work(call, top, o) {
  await call('claim_ticket', { ticket: o.key, trail: o.mapId });
  sh(top, 'checkout', '-qb', o.branch, 'main');
  if (o.remove) sh(top, 'rm', '-q', o.file);
  else {
    fs.writeFileSync(path.join(top, o.file), `${o.file}\n`);
    sh(top, 'add', o.file);
  }
  sh(top, 'commit', '-qm', o.branch);
  const closed = await call('close_ticket', { resolution: `Did ${o.branch}`, ticket: o.key, trail: o.mapId });
  sh(top, 'checkout', '-q', 'main');
  return closed.status;
}

/** The Destination reached dialog with `text`, closed with `button`. */
async function doneDialog(page, text, button) {
  const dialog = page.locator('.dialog.trail-done');
  await dialog.getByText(text).waitFor({ timeout: 60_000 });
  const said = await dialog.locator('p').innerText();
  await dialog.getByRole('button', { name: button }).click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 });
  return said;
}

export async function verifyTrailChecks({ browser, cli, log, shots }) {
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
    const started = await approveSkipInLookout({
      started: await one.call('start_trail', {
        discovery: false,
        title: 'Together',
        destination: 'Both files ship',
        tickets: [
          { ref: 'a', title: 'Add a', type: 'task' },
          { ref: 'b', title: 'Add b', type: 'task' },
        ],
      }),
      page,
      url,
    });
    const mapId = started.trail.id;
    const [a, b] = started.tickets.map((t) => t.key);
    const alone = [
      await work(one.call, top, { key: a, mapId, branch: 'add-a', file: 'a.txt' }),
      await work(one.call, top, { key: b, mapId, branch: 'add-b', file: 'b.txt' }),
    ];
    const aloneOk = alone.every((s) => s === 'done');

    // done, not merged: the destination waits for the merges, and Run now says it doesn't verify the trail
    await doneDialog(page, /not in main on this machine yet/, 'Close');
    await page.locator('g.destination').click();
    const bubble = page.locator('.bubble .trail-checks');
    await bubble.getByText('Checks on main run once everything is merged').waitFor({ timeout: 15_000 });
    await bubble.getByRole('button', { name: 'More about checks on main' }).click();
    const runNow = page.getByRole('menuitem', { name: 'Run now on main as it is' });
    const runNowOk = await runNow.isVisible();
    await page.keyboard.press('Escape');

    // merged: the run on main starts by itself and the two fail together
    sh(top, 'merge', '-q', '--no-ff', '-m', 'merge a', 'add-a');
    sh(top, 'merge', '-q', '--no-ff', '-m', 'merge b', 'add-b');
    const failedText = await doneDialog(page, /test fails on main at [0-9a-f]{7} after merging/, 'See what fails');
    await bubble.getByText('test fails on main with every merge').waitFor({ timeout: 15_000 });
    const item = (await openNeedsList(page)).locator('li.att-item.k-trail-checks');
    await item.waitFor({ timeout: 20_000 });
    const itemText = await item.innerText();
    const itemOk = itemText.includes(`Trail checks fail on main after merging ${a}, ${b}`);
    await closeNeedsList(page);
    await page.locator('g.destination').click();
    if (shots) await page.screenshot({ path: path.join(shots, '19-trail-checks-failed.png') });
    await bubble.getByRole('button', { name: 'Add a fix ticket' }).click();
    // gone from Needs you: open the lists again to see, then close them
    await (
      await openNeedsList(page)
    )
      .locator('li.att-item.k-trail-checks')
      .waitFor({ state: 'detached', timeout: 20_000 });
    await closeNeedsList(page);

    // an agent picks the fix ticket up, and once it is merged the trail is verified together
    const next = await one.call('next_ticket', { trail: mapId, types: ['task'] });
    const fixKey = next.ticket?.key;
    const fixed = await work(one.call, top, { key: fixKey, mapId, branch: 'fix', file: 'b.txt', remove: true });
    sh(top, 'merge', '-q', '--no-ff', '-m', 'merge fix', 'fix');
    const head = sh(top, 'rev-parse', 'HEAD').slice(0, 7);
    const verifiedText = await doneDialog(page, `verified together on main at ${head}`, 'Close');
    await page.locator('g.destination.reached.verified').waitFor({ timeout: 15_000 });
    await bubble.getByText(`Verified together on main at ${head}`).waitFor({ timeout: 15_000 });
    if (shots) await page.screenshot({ path: path.join(shots, '20-trail-verified-together.png') });
    const proof = await one.call('proof_report', { trail: mapId, wholeTrail: true });
    const proofOk =
      proof.status === 'verified' && proof.together?.result === 'pass' && proof.markdown.includes('Trail verified');

    const ok = aloneOk && runNowOk && itemOk && fixed === 'done' && proofOk && !errors.length;
    log(
      `trail verified together ${ok ? 'ok' : 'WRONG'}: ${a}, ${b} done alone (${aloneOk}), Run now offered (${runNowOk}); merged → "${failedText}", item "${itemText.split('\n')[0]}" (${itemOk}); fix ${fixKey} ${fixed} → "${verifiedText}"; trail proof ${proof.status} (${proofOk})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
