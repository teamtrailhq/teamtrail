// M5 guides steps of the end-to-end check (verify-mcp.mjs), on their own scratch project: the trail lead adds a guide
// from a fake catalog in the Lookout and approves the one check it proposes; an agent claims a ticket with that guide,
// gets its instructions and checklist, is refused completion without the checklist, then completes it and the
// guide's check runs. Then a guide of the team's own and one from the second catalog (verifyOwnGuides.mjs).
// Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { skipDiscoveryInLookout } from './e2eHelpers.mjs';
import { PERF, verifyOwnGuides } from './verifyOwnGuides.mjs';

const A11Y = `---
v: 1
id: a11y
name: Accessibility
version: 1.0.0
summary: Checks that the change works with a keyboard and a screen reader.
handles:
  types: [task, execute]
requiresChecks: [a11y]
proposedChecks:
  a11y:
    run: [node, checks/a11y.js]
checklist:
  - Every new control works with the keyboard alone
  - Images have text alternatives
author: Ada Lovelace
license: MIT
---

You make sure everyone can use what this ticket builds. Tab through every new control and check the labels.
`;

const sha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/** A guide catalog as a public catalog repo serves it: index.json and the guide files ({ id: text }). */
async function fakeCatalog(files) {
  const index = {
    v: 1,
    repo: 'https://github.com/teamtrailhq/teamtrail-guides',
    guides: Object.entries(files).map(([id, text]) => ({
      id,
      name: /name: (.+)/.exec(text)[1],
      version: '1.0.0',
      path: `guides/${id}.md`,
      sha256: sha(text),
      summary: /summary: (.+)/.exec(text)[1],
      author: /author: (.+)/.exec(text)[1],
      verified: true,
      reviewedBy: ['maintainer'],
      history: [{ version: '1.0.0', commit: 'abc1234', at: '2026-11-01T10:00:00Z', reviewer: 'maintainer' }],
    })),
  };
  const server = http.createServer((req, res) => {
    if (req.url === '/index.json') return res.end(JSON.stringify(index));
    const id = /^\/guides\/(.+)\.md$/.exec(req.url ?? '')?.[1];
    if (id && files[id]) return res.end(files[id]);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

/**
 * A project whose catalogs are the two fake ones, searched in order (the official one left out, so the check stays
 * offline), with verification on and a passing a11y script in the repo.
 */
function scratchProject(catalogs) {
  const top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-guides-e2e-')), 'app');
  const root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(top, 'checks'));
  fs.writeFileSync(path.join(top, 'checks', 'a11y.js'), "console.log('no issues');\n");
  fs.writeFileSync(path.join(root, 'guides.json'), JSON.stringify({ v: 1, registries: catalogs, official: false }));
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, default: 'checks', checks: {} }));
  return { top, root };
}

async function startServer(cli, cwd) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const m = out.match(/Lookout\s+(http:\S+)/);
      if (m) resolve(m[1]);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, url };
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
  return { client, call };
}

/** Settings → Guides → Browse guides → a11y → Add guide → Approve check a11y, as the trail lead. */
async function addInLookout({ page, url, shot }) {
  // verification.json came with the repo: the trail lead approves it on this machine first (Settings → Approvals).
  // A fresh browser shows onboarding over it first: wait for it rather than race it.
  await page.goto(`${url}?settings=approvals`);
  const onboarding = page.getByRole('button', { name: 'Get started' });
  const checksRow = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await Promise.race([onboarding.waitFor({ timeout: 15_000 }), checksRow.waitFor({ timeout: 15_000 })]);
  if (await onboarding.isVisible()) await onboarding.click();
  await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
  await checksRow.getByRole('button', { name: 'Approve' }).click({ timeout: 15_000 });
  await page.getByText('Nothing waiting').waitFor({ timeout: 15_000 });
  await page.goto(`${url}?settings=guides`);
  const section = page.locator('.guides-section');
  await section.waitFor({ timeout: 15_000 });
  // the deep link lands on the Project group, at Guides
  await page.locator('.sp-nav button[aria-current="page"]', { hasText: 'Project' }).waitFor();
  await section.getByRole('button', { name: 'Browse guides' }).click();
  const dialog = page.locator('.catalog-dialog');
  const row = dialog.locator('li.catalog-row[data-guide-id="a11y"]');
  await row.waitFor({ timeout: 15_000 });
  await shot('20-guide-catalog');
  await row.locator('button').first().click();
  await dialog.getByRole('button', { name: 'Add guide' }).click();
  const approve = dialog.getByRole('button', { name: 'Approve check a11y' });
  await approve.waitFor({ timeout: 15_000 });
  await shot('21-guide-approve-check');
  await approve.click();
  await approve.waitFor({ state: 'detached', timeout: 15_000 });
  // the catalog's review is pinned in the lock, so Settings (under the dialog) shows it without fetching the catalog
  const installed = section.locator('li.guide-row[data-guide-id="a11y"]');
  await installed.getByText('Verified', { exact: true }).waitFor({ timeout: 15_000 });
  // Esc belongs to the dialog on top; the Settings page under it goes once the catalog is closed
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.settings-page').waitFor({ state: 'detached' });
  return true;
}

export async function verifyGuides({ browser, cli, log, shots }) {
  const catalog = await fakeCatalog({ a11y: A11Y });
  const second = await fakeCatalog({ perf: PERF });
  const catalogs = [
    { name: 'e2e', url: catalog.url },
    { name: 'second', url: second.url },
  ];
  const { top, root } = scratchProject(catalogs);
  const { server, url } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });
  const worker = await agent(cli, top);
  try {
    const verifiedInSettings = await addInLookout({ page, url, shot });
    const config = JSON.parse(fs.readFileSync(path.join(root, 'verification.json'), 'utf8'));
    const approved = config.checks.a11y?.run?.join(' ') === 'node checks/a11y.js';
    const pinned = JSON.parse(fs.readFileSync(path.join(root, 'guides.lock.json'), 'utf8')).guides.a11y;

    await worker.call('start_trail', {
      discovery: false,
      questionId: await skipDiscoveryInLookout({ call: worker.call, page, url }),
      title: 'Keyboard shortcuts',
      destination: 'Every action has a shortcut',
      tickets: [{ ref: 'keys', title: 'Add the shortcut sheet', type: 'task', guide: 'a11y' }],
    });
    const claim = await worker.call('claim_ticket', { guides: ['a11y'] });
    const guide = claim.claimed.guide;
    await page.goto(url);
    // the guide's name is a chip in the card's meta row: #1, Task, Accessibility, …
    const signGuide = page.locator('g.node .meta .guide[data-guide-id="a11y"]').first();
    await signGuide.waitFor({ timeout: 15_000 });
    const signText = await signGuide.evaluate((el) => el.querySelector('text')?.textContent ?? '');
    await shot('22-guide-chip');
    let refused = '';
    await worker.call('report_completion', { resolution: 'Added the sheet' }).catch((e) => (refused = e.message));
    const checklist = guide.checklist.map((item) => ({ item, done: true }));
    const done = await worker.call('report_completion', { resolution: 'Added the sheet', checklist });
    const ran = done.checks?.map((c) => `${c.name}:${c.ok}`).join(',');
    const ok =
      approved &&
      verifiedInSettings &&
      /Access/.test(signText ?? '') &&
      pinned?.version === '1.0.0' &&
      pinned?.review?.verified === true &&
      guide?.id === 'a11y' &&
      guide.checklist.length === 2 &&
      /needs an answer for every checklist item/.test(refused) &&
      done.status === 'done' &&
      ran === 'a11y:true' &&
      !errors.length;
    const own = await verifyOwnGuides({ page, url, cli, root, call: worker.call, shot, second: second.url });
    log(
      `guides ${ok ? 'ok' : 'WRONG'}: a11y added from the catalog and pinned (${pinned?.version}), its check approved in the Lookout (${approved}), Verified in Settings, "${signText?.trim()}" on its map card; the claim carried the guide with ${guide?.checklist.length} checklist items; completion refused without them, then ${done.status} with checks ${ran}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    log(own.line);
    return ok && own.ok && !errors.length;
  } finally {
    await worker.client.close();
    await page.close();
    server.kill('SIGTERM');
    catalog.server.close();
    second.server.close();
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
