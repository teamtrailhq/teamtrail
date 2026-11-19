// Done means verified, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo at checks+review:
// a completion with no evidence for its criterion goes back to rework by itself; the next one passes against criteria
// nobody confirmed, so it waits instead of closing, and a review is opened for it by itself. The full ticket's Proof
// section says who is on each gap; the trail lead clicks Confirm criteria, the work is checked again against them on
// the same commit, another agent reviews it, and the proof is verified.
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
  sessionHeaders,
  shootThemes,
  signInWith,
  ticketAction,
} from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { prMergedLive } from './verifyLivePr.mjs';

/** A git repo whose one check passes. */
function scratchRepo() {
  const top = e2eTemp('teamtrail-gaps-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const config = {
    v: 1,
    default: 'checks+review',
    maxAttempts: 3,
    checks: { test: { run: [process.execPath, '-e', '0'] } },
    run: ['test'],
  };
  fs.writeFileSync(path.join(top, '.teamtrail', 'verification.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(top, 'README.md'), '# app\n');
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return { top, git };
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

async function agent(cli, cwd, name) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    stderr: 'pipe',
    env: { ...process.env },
  });
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport);
  const call = async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
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
async function claimOnceMainRan(call, ticket) {
  for (let i = 0; ; i++) {
    try {
      return await call('claim_ticket', ticket ? { ticket } : {});
    } catch (e) {
      if (i > 120 || !/on main/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/** The Proof section in four looks: wide and phone, day and night. */
async function proofShots(page, shots, name) {
  if (!shots) return;
  for (const [size, viewport] of [
    ['wide', { width: 1440, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    const proof = page.locator('.ticket-proof').first();
    if (await proof.isVisible()) await proof.scrollIntoViewIfNeeded();
    await shootThemes(page, shots, `${name}-${size}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Polls the ticket's verification record until `done` says so. */
async function attemptsUntil({ page, lookout, mapId, ticketId, done }) {
  const api = new URL(`/__teamtrail/verification/ticket?mapId=${mapId}&ticketId=${ticketId}`, lookout.url);
  for (let i = 0; i < 120; i++) {
    const v = await (await page.request.get(api.href, { headers: await sessionHeaders(page) })).json();
    if (done(v)) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return undefined;
}

export async function verifyProofGaps({ browser, cli, log, shots }) {
  const { top, git } = scratchRepo();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top, 'claude-code');
  const two = await agent(cli, top, 'codex');
  try {
    await signInWith(page, lookout.pair);
    await approveChecks(page, lookout.url);
    const started = await one.call('start_trail', {
      discovery: false,
      title: 'Exports',
      destination: 'Clients export their data',
      // two, so the first done doesn't finish the trail (and open Destination reached over the inspector)
      tickets: [
        { ref: 'csv', title: 'Add the CSV export', type: 'task' },
        { ref: 'docs', title: 'Document the export', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    const key = started.tickets.find((t) => t.ref === 'csv').key;
    await claimOnceMainRan(one.call, key);
    await one.call('set_criteria', { ticket: key, criteria: [{ text: 'Exports every row', kind: 'unit' }] });
    fs.writeFileSync(path.join(top, 'export.js'), 'module.exports = (rows) => rows.join("\\n");\n');
    git('add', 'export.js');
    git('commit', '-qm', 'export');
    // no evidence for AC-1: back to rework by itself, no human involved
    const missing = await one.call('report_completion', { ticket: key, resolution: 'Added the export', criteria: [] });
    await one.call('claim_ticket', { ticket: key });
    const waits = await one.call('report_completion', {
      ticket: key,
      resolution: 'Added the export',
      criteria: [{ id: 'AC-1', evidence: 'check:test' }],
    });
    // the pass waits for the human's criteria and an agent's review; the review was opened by itself
    const queue = await openNeedsList(page);
    const item = queue.locator('li.att-item', { hasText: 'Confirm the criteria of' });
    await item.waitFor({ timeout: 20_000 });
    await item.locator('.ds-row-main').click();
    await page.locator('.bubble').waitFor({ timeout: 15_000 });
    await openFullTicket(page);
    const proof = page.locator('.ticket-drawer .ticket-proof', { hasText: 'Not verified' });
    await proof.waitFor({ timeout: 15_000 });
    const yours = await proof.getByText('Needs you: confirm the criteria').isVisible();
    const reviewing = await proof.getByText(/Waiting for an agent .*to review it/).isVisible();
    await proofShots(page, shots, 'proof-gaps');
    await ticketAction(page, 'Confirm criteria');
    const ticketId = key.replace('#', '');
    const again = await attemptsUntil({
      page,
      lookout,
      mapId: started.trail.id,
      ticketId,
      done: (v) => v.attempts?.[0]?.criteria?.confirmed === true && !v.running,
    });
    // another agent reviews the attempt graded against the confirmed criteria
    // reviews come first in what an agent is offered
    const next = await two.call('next_ticket');
    if (next.ticket?.type !== 'review') throw new Error(`expected the review first, got ${JSON.stringify(next)}`);
    await two.call('claim_ticket', { ticket: next.ticket.key });
    const reviewed = await two.call('submit_review', { verdict: 'PASS', summary: 'Read it; every row is exported.' });
    const verified = page.locator('.ticket-drawer .ticket-proof', { hasText: 'Verified by Teamtrail' });
    const shown = await verified.waitFor({ timeout: 20_000 }).then(
      () => true,
      () => false,
    );
    await proofShots(page, shots, 'proof-verified');
    // merged where the server merges: the PR block says so at once, no reload
    const root = path.join(top, '.teamtrail');
    const live = await prMergedLive({ page, root, mapId: started.trail.id, ticketId, key });
    const same = again && again.attempts[0].git?.tree?.head === again.attempts[1].git?.tree?.head;
    const ok =
      missing.status === 'rework' &&
      waits.status === 'verifying' &&
      yours &&
      reviewing &&
      !!same &&
      reviewed.phase === 'done' &&
      shown &&
      live.open &&
      live.merged &&
      !errors.length;
    log(
      `done means verified ${ok ? 'ok' : 'WRONG'}: ${key} with no evidence ${missing.status} by itself, its pass ${waits.status} (needs you ${yours}, review opened ${reviewing}), Confirm criteria checked it again on the same commit (${same ? 'yes' : 'NO'}), the review ${reviewed.phase}, proof ${shown ? 'verified' : 'NOT verified'}, its PR shown open (${live.open}) then merged (${live.merged}) live${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await two.client.close();
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
