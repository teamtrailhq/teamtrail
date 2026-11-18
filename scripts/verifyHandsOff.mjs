// Hands-off and Hands-on (verify-mcp.mjs), on their own scratch project and config dir, so the person starts as
// everyone does, Hands-off: the home in place of the map, with Needs you, Progress and Since you were away. An agent's
// question is answered from the list, the plan (the brief and a ticket's criteria) approved in one step and the agent
// can then claim the ticket, and the switch goes to Hands-on's map and back, saved in this person's attention.json.
// Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';

async function startServer(cli, cwd, env) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
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

async function agent(cli, cwd, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  const call = async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

/** A row of Needs you by the words on its chip. */
const needRow = (page, chip) =>
  page.locator('.home-need', { has: page.locator('.home-chip', { hasText: new RegExp(`^${chip}$`) }) }).first();

/** The trail with a plan waiting (criteria, then the brief) and a question the agent waits on. */
async function chart(call) {
  const started = await call('start_trail', {
    title: 'Team workspaces',
    destination: 'Admins manage their team themselves',
    tickets: [{ ref: 'invite', title: 'Invite members by email', type: 'execute' }],
  });
  const invite = started.tickets.find((t) => t.type === 'execute').key;
  await call('set_criteria', {
    ticket: invite,
    criteria: [{ text: 'An invite link works once and expires after 7 days', kind: 'unit' }],
  });
  await call('submit_brief', {
    summary: 'Add team workspaces on the existing organization model.',
    existing: '- `src/auth/sso.ts`: one organization per user',
    assumptions: ['Teams stay under a hundred members'],
  });
  const asked = call('ask_human', { question: 'Invite by email or by link?', suggestions: ['By email', 'By link'] });
  // closing the agent on a failed step ends the wait: that is not the failure to report
  asked.catch(() => undefined);
  return { invite, asked };
}

/** Hands-off, the default: the home, no map and no bar of views; the question answered from its row. */
async function home({ page, asked, shots }) {
  await page.locator('.app.hands-off .hands-off-home').waitFor({ timeout: 20_000 });
  const question = needRow(page, 'Question');
  await question.waitFor({ timeout: 20_000 });
  await needRow(page, 'Plan').waitFor({ timeout: 20_000 });
  const noMap = (await page.locator('.map-zone, .view-bar').count()) === 0;
  await page.locator('.home-progress .trail-segments').waitFor();
  await page.locator('.home-since').waitFor();
  await shootThemes(page, shots, 'hands-off-home');
  if (!(await question.locator('.home-answer').isVisible())) await question.locator('.ds-row-main').click();
  await question.locator('.suggest .chip', { hasText: 'By email' }).click();
  const answer = await asked;
  await question.waitFor({ state: 'detached', timeout: 20_000 });
  return { noMap, answered: answer.answer === 'By email' };
}

/**
 * A phone's header: the title, the destination on one line and one row of controls, the mode switch and More (44px
 * touch targets); More holds focus, the records, Settings and the theme.
 */
async function phoneHeader({ page, shots }) {
  await page.setViewportSize({ width: 390, height: 844 });
  const more = page.locator('.header .phone-more > .btn');
  await more.waitFor({ timeout: 15_000 });
  const box = (sel) => page.locator(sel).first().boundingBox();
  const [modeBox, moreBox, dest] = await Promise.all([box('.header .mode-switch'), more.boundingBox(), box('.h-dest')]);
  const oneRow = Math.abs(modeBox.y - moreBox.y) < 2 && modeBox.height >= 44 && moreBox.height >= 44;
  const oneLine = dest.height < 26;
  const gone = (await page.locator('.h-right .focus-menu, .h-right button[aria-label*="theme"]').count()) === 0;
  await shootThemes(page, shots, 'hands-off-phone');
  await more.click();
  await page.locator('.phone-more .focus-panel').waitFor();
  const items = await page.locator('.phone-more-items [role=menuitem]').allInnerTexts();
  await shootThemes(page, shots, 'hands-off-phone-more');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.header .focus-menu').waitFor({ timeout: 15_000 });
  const listed = ['Trail stats', 'Settings'].every((name) => items.some((i) => i.includes(name)));
  return oneRow && oneLine && gone && listed;
}

/** Approve the plan: the brief and the ticket's criteria shown in its row, approved in one step. */
async function approvePlan({ page, call, invite, repo, shots }) {
  const plan = needRow(page, 'Plan');
  if (!(await plan.locator('.plan-approval').isVisible())) await plan.locator('.ds-row-main').click();
  const shown = await plan.locator('.plan-approval-items').innerText();
  await shootThemes(page, shots, 'hands-off-plan');
  await plan.locator('.plan-approval').getByRole('button', { name: 'Approve the plan', exact: true }).click();
  await plan.waitFor({ state: 'detached', timeout: 20_000 });
  const claimed = await call('claim_ticket', { ticket: invite });
  const journal = path.join(repo, '.teamtrail', '.events', '_trust.jsonl');
  const lines = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n') : [];
  return {
    showed: shown.includes('Add team workspaces') && shown.includes('expires after 7 days'),
    claimed: claimed.claimed?.key === invite,
    journaled: lines.filter((l) => l.includes('approved with the plan')).length === 2,
  };
}

/** Hands-on shows the map and its views; back to Hands-off, the home. Saved in the person's own attention.json. */
async function switchModes({ page, config }) {
  const saved = () => JSON.parse(fs.readFileSync(path.join(config, 'attention.json'), 'utf8')).mode;
  await page.locator('.mode-switch').getByRole('button', { name: 'Hands-on' }).click();
  await page.locator('.view-bar').waitFor({ timeout: 15_000 });
  await page.locator('.map-zone').waitFor();
  await page.waitForFunction(() => document.querySelector('.app.hands-on'));
  const on = saved();
  await page.locator('.mode-switch').getByRole('button', { name: 'Hands-off' }).click();
  await page.locator('.hands-off-home').waitFor({ timeout: 15_000 });
  return on === 'hands-on' && saved() === 'hands-off';
}

export async function verifyHandsOff({ browser, cli, log, shots }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-e2e-hands-'));
  const config = path.join(top, 'config');
  const repo = path.join(top, 'repo');
  fs.mkdirSync(path.join(repo, '.teamtrail'), { recursive: true });
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config };
  const { server, pair } = await startServer(cli, repo, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { client, call } = await agent(cli, repo, env);
  try {
    await signInWith(page, pair);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached' });
    const { invite, asked } = await chart(call);
    // the brief's "research is done" dialog is Hands-on's way in; here the plan is a row
    const phone = await phoneHeader({ page, shots });
    const h = await home({ page, asked, shots });
    const p = await approvePlan({ page, call, invite, repo, shots });
    const switched = await switchModes({ page, config });
    const ok = h.noMap && h.answered && p.showed && p.claimed && p.journaled && switched && phone;
    log(
      `hands-off ${ok ? 'ok' : 'FAILED'}: home by default (no map: ${h.noMap}), answered from the list (${h.answered}), plan shown and approved in one step (shown ${p.showed}, ${invite} claimable ${p.claimed}, journaled ${p.journaled}), Hands-on and back saved per person (${switched}), the phone header one row with More (${phone})`,
    );
    return ok;
  } finally {
    await client.close();
    await page.close();
    server.kill();
    fs.rmSync(top, { recursive: true, force: true });
  }
}
