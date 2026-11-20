// The Lookout behind a server's own sign-in (verify-mcp.mjs), as Teamtrail Cloud embeds it: scripts/managedHost.ts
// serves the built Lookout and the projects hub, and fakes the server's setup steps and agents. On a repo with tests
// and no checks: Scout's Get started guide keeps a strip of its own at the bottom, so the answer box's Send, a row of
// Needs you and the full ticket's footer are never under it, and its open bubble folds on a press outside it; the full
// ticket opened from Hands-off has Back, Esc and the browser's Back, and a page over the home has Back; after New
// trail the Start panel and the agents menu say what done must pass until checks are set, gone once they're approved.
// Waits on what the user sees, never on sleeps.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { build } from 'esbuild';
import { shootThemes } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SETUP = {
  done: 4,
  total: 5,
  complete: false,
  steps: ['Connect GitHub', 'Pick a repository', 'Create a trail', 'Run your agents', 'Invite your team'].map(
    (title, i) => ({ title, href: `/fake/step-${i + 1}`, done: i < 4, next: i === 4 }),
  ),
};

async function hostModule() {
  const out = path.join(here, '..', 'node_modules', '.cache', 'teamtrail-managed-host.mjs');
  const entry = path.join(here, 'managedHost.ts');
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
  });
  return import(out);
}

/** A git repo with tests and no checks: repo readiness says `checks-none`. */
function scratchRepo(top) {
  const repo = path.join(top, 'repo');
  fs.mkdirSync(path.join(repo, '.teamtrail'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ private: true, scripts: { test: 'node -e 0' } }));
  const git = (...a) => execFileSync('git', a, { cwd: repo });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.test', 'commit', '-qm', 'init');
  return repo;
}

async function agent(cli, repo, env) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], cwd: repo, env });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  const call = async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

/** Whether two boxes share any pixel. */
const overlap = (a, b) =>
  !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Nothing of `selector` (visible ones) under the guide. */
async function clearOfGuide(page, selector) {
  const guide = await page.locator('.setup-guide').boundingBox();
  const boxes = await page
    .locator(selector)
    .evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().toJSON()));
  return boxes.length > 0 && boxes.every((b) => !overlap(b, guide));
}

/** The guide: open at first, folded by a press outside it; Send and the rows of Needs you never under it. */
async function guideRoom({ page, shots }) {
  const bubble = page.locator('.setup-bubble');
  await bubble.waitFor({ timeout: 20_000 });
  await page.mouse.click(40, 400);
  await bubble.waitFor({ state: 'detached' });
  const question = page.locator('.home-need', { hasText: 'Invite by email or by link?' });
  await question.getByRole('button', { name: 'Send' }).waitFor({ timeout: 20_000 });
  const rows = await clearOfGuide(page, '.home-need');
  await question.getByText('The whole conversation').click();
  const send = page.locator('.page').getByRole('button', { name: 'Send' });
  await send.waitFor({ timeout: 15_000 });
  const conversation = await clearOfGuide(page, '.page button');
  await shootThemes(page, shots, 'managed-guide-conversation');
  // Hands-off has no bar of views: Back in the header returns to the home
  await page.locator('.page-back').click();
  await page.locator('.hands-off-home').waitFor();
  return { rows, conversation, home: !page.url().includes('view=') };
}

/** The full ticket from Hands-off: Back, the browser's Back and Forward, Esc; focus back on what opened it. */
async function fullTicketBack({ page, shots, phone }) {
  const segment = page.locator('.home-progress .trail-segments > button').first();
  const drawer = page.locator('.ticket-drawer');
  await segment.click();
  await drawer.waitFor();
  const inUrl = page.url().includes('ticket=');
  const footer = await clearOfGuide(page, '.ticket-drawer');
  await shootThemes(page, shots, phone ? 'managed-full-ticket-phone' : 'managed-full-ticket');
  await page.goBack();
  await drawer.waitFor({ state: 'detached' });
  const browserBack = !page.url().includes('ticket=');
  const focused = await segment.evaluate((e) => e === document.activeElement);
  await page.goForward();
  await drawer.waitFor();
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
  await segment.click();
  const back = drawer.locator('.drawer-back').getByRole('button', { name: '← Back' });
  const size = await back.boundingBox();
  await back.click();
  await drawer.waitFor({ state: 'detached' });
  const target = !phone || size.height >= 44;
  return inUrl && footer && browserBack && focused && target && !page.url().includes('ticket=');
}

/** New trail, then Start the trail: the line under it and in the agents menu, gone once checks are approved. */
async function checksLine({ page, shots }) {
  await page.locator('.mode-switch').getByRole('button', { name: 'Hands-on' }).click();
  await page.locator('.map-zone').waitFor({ timeout: 15_000 });
  await page.locator('.trail-btn').first().click();
  await page.getByText('+ New trail').click();
  const dialog = page.locator('.dialog.new-trail');
  await dialog.locator('.new-trail-title input').fill('Billing');
  await dialog.locator('.doc-destination textarea').fill('Teams pay by card.');
  await dialog.getByRole('button', { name: 'Create trail' }).click();
  const note = dialog.locator('.created .checks-note');
  await note.waitFor({ timeout: 20_000 });
  const said = (await note.innerText()) === 'Choose what done must pass before building starts. Set checks';
  // plain, never red: nothing waits on it while discovery runs
  const plain = await note.evaluate((e) => {
    const red = document.createElement('span');
    red.style.color = 'var(--urgent)';
    e.append(red);
    const differs = getComputedStyle(red).color !== getComputedStyle(e).color;
    red.remove();
    return differs;
  });
  // the dialog sits over the guide: its scrim is what a press there reaches
  const guide = await page.locator('.setup-scout').boundingBox();
  const under = await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('.setup-guide'), {
    x: guide.x + guide.width / 2,
    y: guide.y + guide.height / 2,
  });
  await shootThemes(page, shots, 'managed-start-checks');
  await dialog.getByRole('button', { name: 'Start the trail' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 20_000 });
  const menu = page.locator('.agents-menu');
  await menu.locator('> .btn').click();
  const menuNote = menu.locator('.checks-note');
  await menuNote.waitFor({ timeout: 15_000 });
  await shootThemes(page, shots, 'managed-agents-menu-checks');
  await menuNote.getByRole('link', { name: 'Set checks' }).click();
  await page.waitForURL(/settings=verification/);
  const editor = page.locator('.vf-editor');
  await editor.getByRole('button', { name: /Add npm test/ }).click();
  await editor.getByLabel('I know what these commands run, and approve them').check();
  await editor.getByRole('button', { name: 'Save checks' }).click();
  await editor.locator('.vf-edit-check').first().waitFor({ timeout: 15_000 });
  await page.goBack();
  await page.locator('.map-zone').waitFor({ timeout: 15_000 });
  await menu.locator('> .btn').click();
  await menu.getByRole('menuitem', { name: 'Pause agents' }).waitFor();
  await menuNote.waitFor({ state: 'detached', timeout: 15_000 });
  await page.keyboard.press('Escape');
  return said && plain && under;
}

export async function verifyManaged({ browser, cli, log, shots }) {
  const top = e2eTemp('teamtrail-e2e-managed-');
  const config = path.join(top, 'config');
  const repo = scratchRepo(top);
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config };
  // The host's bridge runs in this process and reads the machine store from the environment: this step's config dir,
  // shared with the agent (the same machine key and signed state), never anyone's own.
  const wasConfig = process.env.TEAMTRAIL_CONFIG_DIR;
  process.env.TEAMTRAIL_CONFIG_DIR = config;
  const state = { setup: SETUP, agents: { canRun: true, repos: ['acme/web'], on: false, running: 0 } };
  const { startManagedHost } = await hostModule();
  const host = await startManagedHost({
    root: path.join(repo, '.teamtrail'),
    configDir: config,
    appDir: path.join(here, '..', 'packages', 'cli', 'dist', 'app'),
    state,
  });
  const { client, call } = await agent(cli, repo, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await call('start_trail', {
      title: 'Team workspaces',
      destination: 'Admins manage their team themselves',
      tickets: [{ ref: 'invite', title: 'Invite members by email', type: 'execute' }],
    });
    call('ask_human', { question: 'Invite by email or by link?', suggestions: ['By email', 'By link'] }).catch(
      () => undefined,
    );
    await page.goto(host.url);
    const g = await guideRoom({ page, shots });
    const wide = await fullTicketBack({ page, shots, phone: false });
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneRows = await page
      .locator('.home-need', { hasText: 'Invite by email or by link?' })
      .getByRole('button', { name: 'Send' })
      .waitFor()
      .then(() => clearOfGuide(page, '.home-need'));
    const phone = await fullTicketBack({ page, shots, phone: true });
    await shootThemes(page, shots, 'managed-guide-phone');
    await page.setViewportSize({ width: 1440, height: 900 });
    const checks = await checksLine({ page, shots });
    const ok = g.rows && g.conversation && g.home && wide && phoneRows && phone && checks;
    log(
      `managed sign-in ${ok ? 'ok' : 'FAILED'}: Get started keeps its own strip (rows clear ${g.rows}, conversation's Send clear ${g.conversation}, phone rows clear ${phoneRows}), a page over Hands-off's home has Back (${g.home}), the full ticket from Hands-off closes by Back, Esc and the browser's Back with focus returned (wide ${wide}, phone ${phone}), no checks: said under Start the trail and in the agents menu, gone once approved (${checks})`,
    );
    return ok;
  } finally {
    await page.close();
    await client.close();
    host.close();
    process.env.TEAMTRAIL_CONFIG_DIR = wasConfig;
    fs.rmSync(top, { recursive: true, force: true });
  }
}
