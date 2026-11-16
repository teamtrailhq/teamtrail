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
import { approveSkipInLookout, lookoutLinks, signInWith } from './e2eHelpers.mjs';
import { PERF, verifyOwnGuides } from './verifyOwnGuides.mjs';
import { verifyTrailGuides } from './verifyTrailGuides.mjs';

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

/** After a resize: the layout's transitions have finished and two frames were painted, so a shot shows one layout. */
const settled = (page) =>
  page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

/** An answer to every item of every guide's checklist, each naming its guide. */
const answers = (guides = []) => guides.flatMap((g) => g.checklist.map((item) => ({ guide: g.id, item, done: true })));

/**
 * The trail lead opens the ticket in the inspector: its guides are chips, each saying whether its type gives it or it
 * was added; then, mid-work, they add Docs to this ticket alone. Shot at wide, laptop and phone sizes.
 */
async function addInInspector({ page, shot, title }) {
  await page.locator('.fit-btn').click();
  await page.locator('.node', { hasText: title }).click();
  const section = page.locator('.ticket-guides');
  await section.locator('.ticket-guide-chip[data-guide-id="security"][data-via="type"]').waitFor({ timeout: 15_000 });
  const chipsOf = () =>
    section
      .locator('.ticket-guide-chip')
      .evaluateAll((els) => els.map((el) => `${el.dataset.guideId}:${el.dataset.via}`).join(','));
  const before = await chipsOf();
  await section.scrollIntoViewIfNeeded();
  await shot('22-ticket-guides');
  await section.getByRole('combobox', { name: 'Add a guide to this ticket' }).click();
  await page.getByRole('option', { name: /^Docs/ }).click();
  await section.locator('.ticket-guide-chip[data-guide-id="docs"][data-via="ticket"]').waitFor({ timeout: 15_000 });
  const after = await chipsOf();
  await section.scrollIntoViewIfNeeded();
  await shot('22-ticket-guides-added-wide');
  // the laptop layout keeps the ticket in its side panel, the phone in its Ticket tab
  await page.setViewportSize({ width: 1280, height: 800 });
  await section.locator('.ticket-guide-chip[data-guide-id="docs"]').waitFor({ timeout: 15_000 });
  await settled(page);
  await shot('22-ticket-guides-added-laptop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav.tabbar').getByRole('button', { name: 'Ticket' }).click();
  await section.locator('.ticket-guide-chip[data-guide-id="docs"]').waitFor({ timeout: 15_000 });
  // the layer re-renders as it opens: scroll once it holds still
  await section.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await settled(page);
  await shot('22-ticket-guides-added-phone');
  await page.setViewportSize({ width: 1440, height: 900 });
  const ok =
    before === 'qa:type,security:type,a11y:ticket' && after === 'qa:type,security:type,a11y:ticket,docs:ticket';
  return { ok, chips: after };
}

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
      // reviewed: the catalog's verified.json names this file's hash and the reviewer's login
      verified: true,
      verifiedSha256: sha(text),
      reviewedBy: ['maintainer'],
      history: [{ version: '1.0.0', commit: 'abc1234', at: '2026-11-01T10:00:00Z' }],
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
  const { url, pair } = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const links = lookoutLinks(out);
      if (links) resolve(links);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, url, pair };
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
  // so did guides.json: its catalogs are fetched only once approved here, each shown with its host
  const catalogsRow = page.locator('.ap-row', { hasText: 'Guide catalogs in guides.json' });
  await catalogsRow.getByText(/1\. e2e · 127\.0\.0\.1:\d+/).waitFor({ timeout: 15_000 });
  await shot('19-guide-catalogs-approval');
  await catalogsRow.getByRole('button', { name: 'Approve' }).click({ timeout: 15_000 });
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
  // a catalog other than the official one vouches only for itself, so its Verified names its host
  await installed.getByText(/^Verified by 127\.0\.0\.1:\d+'s catalog$/).waitFor({ timeout: 15_000 });
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
  const { server, url, pair } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });
  const worker = await agent(cli, top);
  try {
    // the link `teamtrail` printed signs this browser in
    await signInWith(page, pair);
    const verifiedInSettings = await addInLookout({ page, url, shot });
    const config = JSON.parse(fs.readFileSync(path.join(root, 'verification.json'), 'utf8'));
    const approved = config.checks.a11y?.run?.join(' ') === 'node checks/a11y.js';
    const pinned = JSON.parse(fs.readFileSync(path.join(root, 'guides.lock.json'), 'utf8')).guides.a11y;

    await approveSkipInLookout({
      started: await worker.call('start_trail', {
        discovery: false,
        title: 'Keyboard shortcuts',
        destination: 'Every action has a shortcut',
        tickets: [
          { ref: 'keys', title: 'Add the shortcut sheet', type: 'task', guide: 'a11y' },
          { ref: 'gaps', title: 'List the actions without a shortcut', type: 'research' },
        ],
      }),
      page,
      url: url,
    });
    // a task takes its type's default guides (qa, security) and the one the charting agent added (a11y)
    const claim = await worker.call('claim_ticket', { guides: ['a11y'] });
    const given = claim.claimed.guides ?? [];
    const claimedGuides = given.map((g) => `${g.id}:${g.via}`).join(',');
    await page.goto(url);
    // the card names only the guide added to the ticket: #1, Task, Accessibility, …
    const signGuide = page.locator('g.node .meta .guide[data-guide-id="a11y"]').first();
    await signGuide.waitFor({ timeout: 15_000 });
    const signText = await signGuide.evaluate((el) => el.querySelector('text')?.textContent ?? '');
    await shot('22-guide-chip');
    const inspector = await addInInspector({ page, shot, title: 'Add the shortcut sheet' });
    // the guide added mid-work reaches the agent at its next report, with what it needs to work in it
    const told = await worker.call('report_progress', { message: 'sheet drafted' });
    const added = told.guidesChanged?.added ?? [];
    let refused = '';
    await worker.call('report_completion', { resolution: 'Added the sheet' }).catch((e) => (refused = e.message));
    let docsMissing = '';
    const asClaimed = answers(given);
    await worker
      .call('report_completion', { resolution: 'Added the sheet', checklist: asClaimed })
      .catch((e) => (docsMissing = e.message));
    const checklist = [...asClaimed, ...answers(added)];
    const done = await worker.call('report_completion', { resolution: 'Added the sheet', checklist });
    const ran = done.checks?.map((c) => `${c.name}:${c.ok}`).join(',');
    // a research ticket takes the architect by default
    const research = await worker.call('claim_ticket', {});
    const researchGuides = (research.claimed.guides ?? []).map((g) => `${g.id}:${g.via}`).join(',');
    await worker.call('close_ticket', {
      resolution: 'Three actions have no shortcut',
      noCodeReason: 'Research only',
      checklist: answers(research.claimed.guides),
    });
    // The trail's tickets are done: the Lookout says Destination reached once, a flag stands at the end of the map,
    // and with no pull request left the dialog only closes.
    const reached = page.locator('.dialog.trail-done');
    await reached.waitFor({ timeout: 15_000 });
    const reachedText = (await reached.textContent()) ?? '';
    await shot('22-destination-reached');
    await reached.getByRole('button', { name: 'Close' }).click();
    await reached.waitFor({ state: 'detached' });
    const flagged = await page.locator('.graph .destination.reached').isVisible();
    const ok =
      approved &&
      verifiedInSettings &&
      /Access/.test(signText ?? '') &&
      pinned?.version === '1.0.0' &&
      pinned?.review?.verified === true &&
      claimedGuides === 'qa:type,security:type,a11y:ticket' &&
      given.find((g) => g.id === 'a11y')?.checklist.length === 2 &&
      inspector.ok &&
      added.map((g) => g.id).join() === 'docs' &&
      /needs an answer for every checklist item/.test(refused) &&
      /Docs guide \(docs\) needs an answer/.test(docsMissing) &&
      done.status === 'done' &&
      ran === 'a11y:true' &&
      researchGuides === 'architect:type' &&
      /Destination reached/.test(reachedText) &&
      flagged &&
      !errors.length;
    const own = await verifyOwnGuides({ page, url, cli, root, call: worker.call, shot, second: second.url });
    const byType = await verifyTrailGuides({ page, url, root, call: worker.call, shots, shot });
    log(
      `guides ${ok ? 'ok' : 'WRONG'}: a11y added from the catalog and pinned (${pinned?.version}), its check approved in the Lookout (${approved}), Verified in Settings, "${signText?.trim()}" on its map card; the task's claim carried ${claimedGuides}; the inspector showed ${inspector.chips} and Docs added mid-work reached the agent at its next report (${added.map((g) => g.id).join() || 'NOT TOLD'}); completion refused without checklists and again without Docs', then ${done.status} with checks ${ran}; the research ticket took ${researchGuides}; then Destination reached (${flagged ? 'flag on the map' : 'NO FLAG'})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    log(own.line);
    log(byType.line);
    return ok && own.ok && byType.ok && !errors.length;
  } finally {
    await worker.client.close();
    await page.close();
    server.kill('SIGTERM');
    catalog.server.close();
    second.server.close();
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
