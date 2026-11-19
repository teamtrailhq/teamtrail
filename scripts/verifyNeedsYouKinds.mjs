// Every kind of Needs you item on a phone (verify-mcp.mjs): Hands-off at 390px, day and night, on the dev seed (a
// plan, criteria, reroutes, approvals on this machine, guides, field guide entries, a model wait, a risky change,
// overlapping claims, decisions for the human), a real agent's question with suggestions, and every other kind built
// as the server builds it (needsYouKindItems.mjs). Each row, closed and open: nothing sticks out of its card, the page
// never scrolls sideways, every action is a 44px target, the open body fits the screen (scrolling inside when long),
// and nothing offers a way that leads nowhere in Hands-off. Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { build } from 'esbuild';
import { lookoutLinks, signInWith } from './e2eHelpers.mjs';
import { measureNeed } from './measureNeed.mjs';
import { builtItems, SEEDED_KINDS } from './needsYouKindItems.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUESTION =
  'Should a note edited offline on two phones keep both versions side by side until someone picks one, or merge them silently?';

/** The dev seed, written into `<top>/repo/.teamtrail` with its machine store in `<top>/config`. */
async function seed(top, env) {
  const out = path.join(top, 'seed-dev.mjs');
  await build({
    entryPoints: [path.join(root, 'scripts/seed-dev.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
    outfile: out,
  });
  const dir = path.join(top, 'repo', '.teamtrail');
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [out], { cwd: root, env: { ...env, TEAMTRAIL_DIR: dir }, stdio: 'ignore' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`the seed exited ${code}`))));
  });
}

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

/** An agent on the main trail that asks the human, with suggestions, and waits. */
async function askingAgent(cli, cwd, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  const call = async (tool, args) => {
    const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  await call('resume_trail', { trail: 'offline-first-sync-for-fieldnote' }).catch(() => undefined);
  const asked = call('ask_human', {
    question: QUESTION,
    suggestions: ['Keep both side by side until someone picks', 'Merge silently and log it', 'Ask the note owner'],
    urgency: 'blocking',
  });
  // closing the agent at the end ends the wait: that is not a failure
  asked.catch(() => undefined);
  return client;
}

/** Every row shown: "Show N more" pressed until nothing is behind it. */
async function showAll(page) {
  const more = page.locator('.home-needs .home-more', { hasText: /^Show \d+ more$/ });
  if (await more.count()) await more.click();
}

/** A row by its title: open or close it as asked, its body there once open. */
async function setOpen(row, open) {
  const isOpen = await row.evaluate((r) => r.classList.contains('open'));
  if (isOpen !== open) await row.locator('> .ds-row-main').tap();
  if (open) await row.locator('.home-need-body').waitFor();
  else await row.locator('.home-need-body').waitFor({ state: 'detached' });
}

/** An open row's "⋯" menu, opened: every entry on screen and a 44px target, then closed again. */
async function moreMenu(row) {
  const more = row.locator('.home-need-body .more-btn');
  if (!(await more.count())) return [];
  await more.tap();
  const list = row.locator('.more-list');
  await list.waitFor();
  const problems = await list.evaluate((l) =>
    [...l.querySelectorAll('[role=menuitem]')].flatMap((el) => {
      const r = el.getBoundingClientRect();
      const label = el.textContent.trim().slice(0, 30);
      if (r.top < 0 || r.bottom > window.innerHeight + 1) return [`"${label}" off screen at ${Math.round(r.top)}`];
      return r.height < 43.5 ? [`"${label}" is ${Math.round(r.height)}px tall`] : [];
    }),
  );
  await row.page().keyboard.press('Escape');
  await list.waitFor({ state: 'detached' });
  return problems;
}

/** Measures every row, closed and open, at 390px in both themes; screenshots of each open one. */
async function measureAll({ page, items, shots }) {
  const failures = [];
  for (const item of items) {
    const row = page.locator('.home-need', { hasText: item.title.slice(0, 48) }).first();
    if (!(await row.count())) {
      failures.push(`${item.kind}: no row "${item.title.slice(0, 48)}"`);
      continue;
    }
    for (const open of [false, true]) {
      await setOpen(row, open);
      await row.evaluate((r) => r.scrollIntoView({ block: 'start' }));
      for (const theme of ['night', 'day']) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        const m = await row.evaluate(measureNeed, { open });
        if (m.length) failures.push(`${item.kind} ${open ? 'open' : 'closed'} ${theme}: ${m.join('; ')}`);
        if (shots && open)
          await page.screenshot({ path: path.join(shots, `needs-you-kind-${item.kind}-${item.shot}-${theme}.png`) });
      }
    }
    const menu = await moreMenu(row);
    if (menu.length) failures.push(`${item.kind} "⋯": ${menu.join('; ')}`);
    await setOpen(row, false);
  }
  await page.evaluate(() => delete document.documentElement.dataset.theme);
  return failures;
}

/** The words a row leads with: the question asked, the plan to approve (PlanNeedRow), else the item's title. */
function rowTitle(i) {
  if (i.kind === 'question') return QUESTION;
  if (i.kind === 'brief') return 'Approve the plan';
  return i.title.split('\n')[0];
}

export async function verifyNeedsYouKinds({ browser, cli, log, shots }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-e2e-kinds-'));
  const config = path.join(top, 'config');
  const repo = path.join(top, 'repo');
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config };
  await seed(top, env);
  const { server, url, pair } = await startServer(cli, repo, env);
  // a phone: touch, so rows open by a tap as they do in a hand
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  let agent;
  try {
    await signInWith(page, pair);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached' });
    agent = await askingAgent(cli, repo, env);
    await page.locator('.home-need', { hasText: QUESTION.slice(0, 48) }).waitFor({ timeout: 20_000 });
    // the kinds the seed doesn't make, as their sources make them, added to the queue the page reads
    const extra = builtItems(Date.now());
    await page.route(/\/__teamtrail\/attention$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      const view = await res.json();
      await route.fulfill({ response: res, json: { ...view, items: [...view.items, ...extra] } });
    });
    await page.goto(url);
    await page.waitForFunction(
      (n) => Number(document.querySelector('#home-needs')?.textContent.match(/\d+/)?.[0]) > n,
      extra.length,
      { timeout: 20_000 },
    );
    await showAll(page);
    const real = await page.evaluate(async () => (await (await fetch('/__teamtrail/attention')).json()).items);
    const seeded = real.filter((i) => !extra.some((e) => e.id === i.id));
    const kinds = new Set(real.map((i) => i.kind));
    const missing = [...SEEDED_KINDS, 'question'].filter((k) => !seeded.some((i) => i.kind === k));
    const shown = real
      .filter((i) => i.kind !== 'criteria' || !real.some((b) => b.kind === 'brief' && b.mapId === i.mapId))
      .map((i, n) => ({ kind: i.kind, title: rowTitle(i), shot: n }));
    const failures = [
      ...missing.map((k) => `the seed made no ${k} item`),
      ...(await measureAll({ page, items: shown, shots })),
    ];
    const ok = failures.length === 0;
    log(
      `needs you kinds ${ok ? 'ok' : 'FAILED'}: ${shown.length} rows of ${kinds.size} kinds fit a 390px phone open and closed, day and night, with 44px actions${ok ? '' : `:\n  ${failures.join('\n  ')}`}`,
    );
    return ok;
  } finally {
    await agent?.close();
    await context.close();
    server.kill();
    fs.rmSync(top, { recursive: true, force: true });
  }
}
