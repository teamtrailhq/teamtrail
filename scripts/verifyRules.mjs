// Diff rules, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo: the trail lead opens Settings
// with a rule prefilled from the address bar (`?settings=rules&when=…&why=…`, as an "add a rule?" link does), adds its
// question and saves it, approved in the same step. An agent claiming src/session/** is told the rule will likely
// apply; its completion without the answer is refused with the rule's question; the full ticket shows the held rule
// with Go without; going without it shows Went without R-1 with Undo, and after Undo the next completion is held for
// R-1 again (verifyRuleUndo.mjs); answering it completes the ticket, and the proof shows the answer as claimed.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  answeringChecklists,
  approveSkipInLookout,
  clickNode,
  lookoutLinks,
  openFullTicket,
  shootThemes,
  signInWith,
} from './e2eHelpers.mjs';
import { goWithoutThenUndo } from './verifyRuleUndo.mjs';

const WHY = 'D-12: old sessions failed to load after #34';
const ASK = 'Does a new field load from older transcripts that lack it?';

/** A git repo whose `npm test` passes, with verification.json asking for it. */
function scratchRepo() {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-rules-e2e-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  const scripts = { test: 'node -e "process.exit(0)"' };
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ private: true, scripts }, null, 2));
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

const withQuery = (url, q) => `${url}${url.includes('?') ? '&' : '?'}${q}`;

/** The first run on this machine: the check command approved once in Settings → Approvals. */
async function approveChecks(page, url) {
  await page.locator('.dialog.onboarding').waitFor();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.goto(withQuery(url, 'settings=approvals'));
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  const again = page.getByRole('button', { name: 'Get started' });
  if (await again.isVisible()) await again.click();
  await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
}

/** Settings → Diff rules opened from a link with the rule's files and reason: add its question and save. */
async function addPrefilledRule(page, url, shots) {
  const q = new URLSearchParams({ settings: 'rules', when: 'src/session/**', why: WHY });
  await page.goto(withQuery(url, q.toString()));
  const editor = page.locator('.dr-editor');
  const row = editor.locator('.dr-edit-rule').last();
  await row.waitFor({ timeout: 15_000 });
  const prefilled =
    (await row.getByLabel('When these files change').inputValue()) === 'src/session/**' &&
    (await row.getByLabel('Why').inputValue()) === WHY;
  await row.getByLabel('Question').fill(ASK);
  if (shots) await shootThemes(page, shots, 'diff-rules');
  await editor.getByRole('button', { name: 'Save rules' }).click();
  await editor.getByText('Saved and approved.').waitFor({ timeout: 15_000 });
  await page.locator('.dr-edit-rule .dr-id', { hasText: 'R-1' }).waitFor({ timeout: 15_000 });
  return prefilled;
}

/** Claims the next ticket once the run of the checks on main lets implementation start. */
async function claimOnceMainRan(call, args) {
  for (let i = 0; ; i++) {
    try {
      return await call('claim_ticket', args);
    } catch (e) {
      if (i > 120 || !/on main/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export async function verifyRules({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  try {
    await signInWith(page, lookout.pair);
    await approveChecks(page, lookout.url);
    const prefilled = await addPrefilledRule(page, lookout.url, shots);
    const started = await one.call('start_trail', {
      discovery: false,
      title: 'Sessions',
      destination: 'Sessions keep their new field',
      tickets: [
        { ref: 'field', title: 'Add a session field', type: 'task' },
        { ref: 'docs', title: 'Document it', type: 'task' },
      ],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    const claimed = await claimOnceMainRan(one.call, { touches: ['src/session/**'] });
    const told = claimed.rules?.some((r) => r.id === 'R-1' && r.ask === ASK) === true;
    const key = claimed.claimed.key;
    fs.mkdirSync(path.join(top, 'src/session'), { recursive: true });
    fs.writeFileSync(path.join(top, 'src/session/store.js'), 'export const field = 1;\n');
    const refusal = await one.call('close_ticket', { ticket: key, resolution: 'Added the field' }).then(
      () => '',
      (e) => e.message,
    );
    const refused = refusal.includes(`R-1 asks: ${ASK}`);
    await page.goto(lookout.url);
    await clickNode(page, page.locator('.node', { hasText: 'Add a session field' }));
    await openFullTicket(page);
    const held = page.locator('.ticket-drawer .dr-held');
    await held.getByText(ASK).waitFor({ timeout: 15_000 });
    const offered = await held.getByRole('button', { name: 'Go without' }).count();
    if (shots) await page.screenshot({ path: path.join(shots, 'diff-rules-held.png') });
    const undone = await goWithoutThenUndo({ page, call: one.call, key, ask: ASK, shots });
    const answer = 'Yes: the loader defaults the field, and a test loads an old transcript.';
    const done = await one.call('close_ticket', {
      ticket: key,
      resolution: 'Added the field',
      ruleAnswers: [{ rule: 'R-1', answer }],
    });
    const report = await one.call('proof_report', { ticket: key });
    const proven = /\*\*Diff rules:\*\*/.test(report.markdown) && /claimed, not verified/.test(report.markdown);
    await held.waitFor({ state: 'detached', timeout: 15_000 });
    const ok = prefilled && told && refused && offered > 0 && undone && done.closed === key && proven && !errors.length;
    log(
      `diff rules ${ok ? 'ok' : 'WRONG'}: prefilled from the link ${prefilled}, saved and approved as R-1, the claim ${told ? 'named it' : 'did NOT name it'}, a completion without the answer ${refused ? 'refused with the question' : `NOT refused (${refusal})`}, the ticket offered Go without ${offered > 0}, ${undone ? 'went without R-1 and undid it, asked again' : 'Go without and Undo did NOT work'}, answered and ${done.closed === key ? 'done' : `NOT done (${JSON.stringify(done)})`}, the proof ${proven ? 'shows the answer as claimed' : 'MISSING the rule'}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
