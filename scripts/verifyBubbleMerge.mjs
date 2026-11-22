// Merge from the bubble, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo, behind a fake
// server that merges pull requests (`managed.merge`, as Teamtrail Cloud is): a done ticket whose proof isn't verified
// (accepted without its failing check) and whose pull request is open is "ready to merge" in Needs you. Its bubble
// leads with Merge anyway…, the same action its row in Hands-off's Needs you leads with; one question with the gaps
// it accepts, then the trail lead's acceptance is recorded and the fake server is asked to merge with its hash.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  answeringChecklists,
  approveSkipInLookout,
  lookoutLinks,
  openNeedsList,
  sessionHeaders,
  shootThemes,
  signInWith,
} from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { stopProcess } from './stopProcess.mjs';
import { prSnapshot, writeSnapshot } from './verifyLivePr.mjs';

const MERGE_PATH = '/fake-server/merge';
const HEAD_MOVED = 'The pull request has new commits since you looked. Review again.';

/** A git repo whose `npm test` passes on main and fails once feed.xml is there. */
function scratchRepo() {
  const top = e2eTemp('teamtrail-bubble-merge-e2e-');
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

/** The first run on this machine: the check command approved once, through the API the page uses. */
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

/** The ticket done and not verified: its held completion accepted without `test`, as the queue's item offers. */
async function waive({ page, url, mapId, ticketId }) {
  const headers = await sessionHeaders(page);
  const api = (p) => new URL(`/__teamtrail${p}`, url).href;
  for (let i = 0; i < 120; i++) {
    const v = await (
      await page.request.get(api(`/verification/ticket?mapId=${mapId}&ticketId=${ticketId}`), { headers })
    ).json();
    if (v.waivable?.length && !v.running) {
      const checks = v.waivable.map((c) => ({ name: c.name, hash: c.hash }));
      const data = { mapId, ticketId, attemptId: v.attempts[0].id, checks, reason: 'No runner for it here yet' };
      const r = await page.request.post(api('/verification/waive'), { headers, data });
      if (!r.ok()) throw new Error(`waive refused: ${r.status()} ${await r.text()}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('the held completion never offered a waiver');
}

/**
 * The page behind a server that merges: `GET /session` says `managed` with `merge`, every API call carries the
 * session the browser paired with, added on the way as the server in front signs requests itself, and the merge
 * path is the fake.
 */
async function behindMergingServer({ page, ticket, root, respond = mergedNow }) {
  const { 'X-Teamtrail-Session': secret } = await sessionHeaders(page);
  // no session of its own: a page behind such a server has none, and reads who it is from `GET /session`
  await page.evaluate(() => localStorage.removeItem('teamtrail.session'));
  await page.route('**/__teamtrail/**', async (route) => {
    const req = route.request();
    const headers = { ...req.headers(), 'x-teamtrail-session': secret };
    if (new URL(req.url()).pathname !== '/__teamtrail/session') return route.continue({ headers });
    const r = await route.fetch({ headers });
    const json = { ...(await r.json()), managed: { name: 'Ada', pages: [], merge: MERGE_PATH } };
    return route.fulfill({ response: r, json });
  });
  const asked = [];
  await page.route(`**${MERGE_PATH}`, async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    return route.fulfill({ json: respond({ root, ticket, body, n: asked.length }) });
  });
  return asked;
}

/** Merged, and kept so by the server, as Cloud's engine keeps it (pull-outcome). */
function mergedNow({ root, ticket }) {
  writeSnapshot({ root, ...ticket, state: 'merged' });
  const sync = prSnapshot({ ...ticket, state: 'merged' });
  return { merged: true, url: sync.pr.url, sync };
}

/**
 * The bubble at 1440 and 390, day and night; `before` runs at each size first (the phone lays the bubble out again,
 * so a question opened under its bar is opened again there).
 */
async function bubbleShots(page, shots, name, before = async () => {}) {
  for (const [size, viewport] of [
    ['390', { width: 390, height: 844 }],
    ['1440', { width: 1440, height: 900 }],
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    await before();
    if (!shots) continue;
    await page.locator('.bubble .action-bar').first().scrollIntoViewIfNeeded();
    await shootThemes(page, shots, `${name}-${size}`);
  }
}

/** The bar's primary button in a place: its first button, the one the bar leads with. */
const primaryOf = (bar) => bar.locator('.btn').first().innerText();

/** Hands-off's row for the merge item leads with the same action; back to Hands-on after. */
async function handsOffRow(page) {
  await page.locator('.mode-switch').getByRole('button', { name: 'Hands-off' }).click();
  const row = page.locator('.home-need', { hasText: 'ready to merge' }).first();
  await row.waitFor({ timeout: 20_000 });
  // the first row may be open already; else its button opens it
  const opener = row.getByRole('button', { name: 'Merge', exact: true });
  if (await opener.isVisible()) await opener.click();
  const bar = row.locator('.home-need-body .action-bar');
  await bar.waitFor({ timeout: 15_000 });
  await bar.getByRole('button', { name: 'Merge anyway…' }).waitFor({ timeout: 15_000 });
  const primary = await primaryOf(bar);
  await page.locator('.mode-switch').getByRole('button', { name: 'Hands-on' }).click();
  await page.locator('.hands-off-home').waitFor({ state: 'detached', timeout: 15_000 });
  return primary;
}

export async function verifyBubbleMerge({ browser, cli, log, shots }) {
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
      // two, so the first done doesn't finish the trail (and open Destination reached over the bubble)
      tickets: [
        { ref: 'rss', title: 'Add the RSS feed', type: 'task' },
        { ref: 'atom', title: 'Add the Atom feed', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    const claimed = await claimOnceMainRan(one.call);
    const key = claimed.claimed.key;
    const ticket = { mapId: started.trail.id, ticketId: claimed.claimed.id ?? key.replace('#', ''), key };
    fs.writeFileSync(path.join(top, 'feed.xml'), '<rss/>');
    await one.call('close_ticket', { ticket: key, resolution: 'Added /feed.xml' });
    await waive({ page, url: lookout.url, ...ticket });
    // its pull request, open, as the server that merges keeps it
    writeSnapshot({ root: path.join(top, '.teamtrail'), ...ticket, state: 'open' });
    const asked = await behindMergingServer({ page, ticket, root: path.join(top, '.teamtrail') });
    await page.goto(lookout.url);
    const item = (await openNeedsList(page)).locator('li.att-item.k-merge', { hasText: 'ready to merge' });
    await item.waitFor({ timeout: 20_000 });
    await item.locator('.ds-row-main').click();
    const bubble = page.locator('.bubble');
    await bubble.locator('.bubble-bar', { hasText: 'Ready to merge' }).waitFor({ timeout: 15_000 });
    const bar = bubble.locator('.action-bar');
    await bar.getByRole('button', { name: 'Merge anyway…' }).waitFor({ timeout: 15_000 });
    const bubblePrimary = await primaryOf(bar);
    await bubbleShots(page, shots, 'bubble-merge-anyway');
    await page.keyboard.press('Escape');
    const rowPrimary = await handsOffRow(page);
    // the bubble again, Hands-on: the one question, with the gaps it accepts, then the merge
    await (await openNeedsList(page)).locator('li.att-item.k-merge .ds-row-main').click();
    const form = bubble.locator('.merge-form');
    const ask = async () => {
      if (!(await form.isVisible())) await bar.getByRole('button', { name: 'Merge anyway…' }).click();
      await form.getByText('Merge without a verified proof?').waitFor({ timeout: 15_000 });
    };
    await bubbleShots(page, shots, 'bubble-merge-anyway-confirm', ask);
    const gapShown = await form.getByText(/test didn't run: .+ accepted the work without it\./).isVisible();
    await form.getByRole('button', { name: 'Merge anyway', exact: true }).click();
    await bubble.getByText('Merged at the commit its proof covers.').waitFor({ timeout: 15_000 });
    const sent = asked.at(-1) ?? {};
    const named =
      sent.trail === ticket.mapId &&
      sent.ticket === ticket.ticketId &&
      sent.anyway === true &&
      /^sha256:/.test(sent.gaps);
    const gone = await bar
      .getByRole('button', { name: 'Merge anyway…' })
      .waitFor({ state: 'detached', timeout: 15_000 })
      .then(
        () => true,
        () => false,
      );
    const ok =
      bubblePrimary === 'Merge anyway…' &&
      rowPrimary === 'Merge anyway…' &&
      gapShown &&
      named &&
      gone &&
      !errors.length;
    log(
      `merge from the bubble ${ok ? 'ok' : 'WRONG'}: ${key} done, not verified, its PR open: the bubble leads with ${bubblePrimary}, Hands-off's row with ${rowPrimary}; one question with its gaps (${gapShown}), the server asked with the accepted gaps' hash (${named ? 'yes' : JSON.stringify(sent)}), no merge offered once merged (${gone})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    await stopProcess(lookout.proc);
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}

const SHOWN = 'e'.repeat(40);
const MOVED = 'f'.repeat(40);

/** A git repo with no checks set: a finished task closes with nothing checked, so its proof names no commit. */
function bareRepo() {
  const top = e2eTemp('teamtrail-merge-at-head-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  fs.writeFileSync(path.join(top, 'README.md'), '# app\n');
  // a site already, not a new repo (which would start with its setup ticket): a page at the top
  fs.writeFileSync(path.join(top, 'index.html'), '<h1>app</h1>\n');
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

/** The ticket's pull request as the server that merges keeps it, at a given head. */
function headSnapshot({ root, ticket, state, headSha }) {
  const sync = prSnapshot({ ...ticket, state });
  sync.pr.headSha = headSha;
  const dir = path.join(root, '.evidence', ticket.mapId, ticket.ticketId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sync.json.tmp'), JSON.stringify(sync));
  fs.renameSync(path.join(dir, 'sync.json.tmp'), path.join(dir, 'sync.json'));
  return sync;
}

/**
 * As Cloud answers: the first merge finds the pull request moved on since the page loaded (a new commit, kept by the
 * server and carried in the reply); the next, at the new head, merges.
 */
function movedOnce({ root, ticket, body, n }) {
  if (n === 1) return { error: HEAD_MOVED, sync: headSnapshot({ root, ticket, state: 'open', headSha: MOVED }) };
  if (body.head !== MOVED) return { error: `asked at ${body.head}` };
  return { merged: true, url: headSnapshot({ root, ticket, state: 'merged', headSha: MOVED }).pr.url };
}

/** A shot of the bubble at 1440, day and night. */
async function shootBubble(page, shots, name) {
  await page.locator('.bubble .merge-form').scrollIntoViewIfNeeded();
  await shootThemes(page, shots, `${name}-1440`);
}

/**
 * Merge anyway on a ticket finished with no checks set (its proof names no commit), behind the same fake server that
 * merges: the bubble offers Merge anyway… at the pull request's head as PR sync shows it, the trail lead's acceptance
 * and the merge name that head, a head that moved on is refused with the server's words and the new head is shown,
 * and accepting again merges at it.
 */
export async function verifyBubbleMergeAtHead({ browser, cli, log, shots }) {
  const top = bareRepo();
  const root = path.join(top, '.teamtrail');
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  try {
    await signInWith(page, lookout.pair);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
    const started = await one.call('start_trail', {
      discovery: false,
      title: 'Landing',
      destination: 'Visitors see what the app does',
      tickets: [
        { ref: 'hero', title: 'Write the hero copy', type: 'task' },
        { ref: 'faq', title: 'Write the FAQ', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    const claimed = await one.call('claim_ticket', {});
    const key = claimed.claimed.key;
    const ticket = { mapId: started.trail.id, ticketId: claimed.claimed.id ?? key.replace('#', ''), key };
    fs.writeFileSync(path.join(top, 'hero.md'), '# Ship work you can trust\n');
    await one.call('close_ticket', { ticket: key, resolution: 'Wrote the hero copy' });
    headSnapshot({ root, ticket, state: 'open', headSha: SHOWN });
    const asked = await behindMergingServer({ page, ticket, root, respond: movedOnce });
    await page.goto(lookout.url);
    const item = (await openNeedsList(page)).locator('li.att-item.k-merge', { hasText: 'ready to merge' });
    await item.waitFor({ timeout: 20_000 });
    await item.locator('.ds-row-main').click();
    const bubble = page.locator('.bubble');
    const bar = bubble.locator('.action-bar');
    await bar.getByRole('button', { name: 'Merge anyway…' }).waitFor({ timeout: 15_000 });
    const primary = await primaryOf(bar);
    await bar.getByRole('button', { name: 'Merge anyway…' }).click();
    const form = bubble.locator('.merge-form');
    const code = form.locator('code');
    await form.getByText('Its proof names no commit').waitFor({ timeout: 15_000 });
    const shownHead = await code.innerText();
    await shootBubble(page, shots, 'bubble-merge-at-head-confirm');
    await form.getByRole('button', { name: 'Merge anyway', exact: true }).click();
    await form.getByText(HEAD_MOVED).waitFor({ timeout: 15_000 });
    // the new head, shown in place of the one the pull request moved past
    await code.filter({ hasText: MOVED.slice(0, 12) }).waitFor({ timeout: 15_000 });
    await shootBubble(page, shots, 'bubble-merge-at-head-moved');
    await form.getByRole('button', { name: 'Merge anyway', exact: true }).click();
    await bubble.getByText(`Merged at head ${MOVED.slice(0, 12)}, as you accepted it.`).waitFor({ timeout: 15_000 });
    const [first, second] = asked;
    const named = (b, head) =>
      b?.trail === ticket.mapId &&
      b.ticket === ticket.ticketId &&
      b.anyway === true &&
      /^sha256:/.test(b.gaps) &&
      b.head === head;
    const sent = named(first, SHOWN) && named(second, MOVED) && first.gaps !== second.gaps;
    const ok = primary === 'Merge anyway…' && shownHead === SHOWN.slice(0, 12) && sent && !errors.length;
    log(
      `merge anyway at the PR head ${ok ? 'ok' : 'WRONG'}: ${key} finished with no checks set, its PR open: the bubble leads with ${primary}, the question names head ${shownHead}; the server asked at the head shown (${sent ? 'yes' : JSON.stringify(asked)}), refused once it moved, the new head shown and merged${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    await stopProcess(lookout.proc);
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
