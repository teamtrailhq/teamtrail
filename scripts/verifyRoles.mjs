// M5 roles steps of the end-to-end check (verify-mcp.mjs), on their own scratch project: the trail lead adds a role
// from a fake catalog in the Lookout and approves the one check it proposes; an agent claims a ticket with that role,
// gets its instructions and checklist, is refused completion without the checklist, then completes it and the
// role's check runs. Waits on what the user sees, never on sleeps.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

/** A role catalog as a public catalog repo serves it: index.json and the role file. */
async function fakeCatalog() {
  const index = {
    v: 1,
    repo: 'https://github.com/teamtrailhq/teamtrail-guides',
    roles: [
      {
        id: 'a11y',
        name: 'Accessibility',
        version: '1.0.0',
        path: 'roles/a11y.md',
        sha256: `sha256:${createHash('sha256').update(A11Y).digest('hex')}`,
        summary: 'Checks that the change works with a keyboard and a screen reader.',
        author: 'Ada Lovelace',
        verified: true,
        reviewedBy: ['maintainer'],
        history: [{ version: '1.0.0', commit: 'abc1234', at: '2026-11-01T10:00:00Z', reviewer: 'maintainer' }],
      },
    ],
  };
  const server = http.createServer((req, res) => {
    if (req.url === '/index.json') return res.end(JSON.stringify(index));
    if (req.url === '/roles/a11y.md') return res.end(A11Y);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

/** A project whose catalog is the fake one, with verification on and a passing a11y script in the repo. */
function scratchProject(catalogUrl) {
  const top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-roles-e2e-')), 'app');
  const root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(top, 'checks'));
  fs.writeFileSync(path.join(top, 'checks', 'a11y.js'), "console.log('no issues');\n");
  fs.writeFileSync(
    path.join(root, 'roles.json'),
    JSON.stringify({ v: 1, registries: [{ name: 'e2e', url: catalogUrl }] }),
  );
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
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], cwd, stderr: 'pipe' });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

/** Settings → Roles → Browse catalog → a11y → Add role → Approve check a11y, as the trail lead. */
async function addInLookout({ page, url, shot }) {
  await page.goto(`${url}?settings=roles`);
  const onboarding = page.getByRole('button', { name: 'Get started' });
  if (await onboarding.isVisible().catch(() => false)) await onboarding.click();
  const section = page.locator('.roles-section');
  await section.waitFor({ timeout: 15_000 });
  await section.getByRole('button', { name: 'Browse catalog' }).click();
  const dialog = page.locator('.catalog-dialog');
  const row = dialog.locator('li.catalog-row[data-role-id="a11y"]');
  await row.waitFor({ timeout: 15_000 });
  await shot('20-role-catalog');
  await row.locator('button').first().click();
  await dialog.getByRole('button', { name: 'Add role' }).click();
  const approve = dialog.getByRole('button', { name: 'Approve check a11y' });
  await approve.waitFor({ timeout: 15_000 });
  await shot('21-role-approve-check');
  await approve.click();
  await approve.waitFor({ state: 'detached', timeout: 15_000 });
  await page.keyboard.press('Escape');
}

export async function verifyRoles({ browser, cli, log, shots }) {
  const catalog = await fakeCatalog();
  const { top, root } = scratchProject(catalog.url);
  const { server, url } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });
  const worker = await agent(cli, top);
  try {
    await addInLookout({ page, url, shot });
    const config = JSON.parse(fs.readFileSync(path.join(root, 'verification.json'), 'utf8'));
    const approved = config.checks.a11y?.run?.join(' ') === 'node checks/a11y.js';
    const pinned = JSON.parse(fs.readFileSync(path.join(root, 'roles.lock.json'), 'utf8')).roles.a11y;

    await worker.call('start_trail', {
      discovery: false,
      title: 'Keyboard shortcuts',
      destination: 'Every action has a shortcut',
      tickets: [{ ref: 'keys', title: 'Add the shortcut sheet', type: 'task', role: 'a11y' }],
    });
    const claim = await worker.call('claim_ticket', { roles: ['a11y'] });
    const role = claim.claimed.role;
    await page.goto(url);
    await page.locator('.role-chip[data-role-id="a11y"]').first().waitFor({ timeout: 15_000 });
    await shot('22-role-chip');
    let refused = '';
    await worker.call('report_completion', { resolution: 'Added the sheet' }).catch((e) => (refused = e.message));
    const checklist = role.checklist.map((item) => ({ item, done: true }));
    const done = await worker.call('report_completion', { resolution: 'Added the sheet', checklist });
    const ran = done.checks?.map((c) => `${c.name}:${c.ok}`).join(',');
    const ok =
      approved &&
      pinned?.version === '1.0.0' &&
      role?.id === 'a11y' &&
      role.checklist.length === 2 &&
      /needs an answer for every checklist item/.test(refused) &&
      done.status === 'done' &&
      ran === 'a11y:true' &&
      !errors.length;
    log(
      `roles ${ok ? 'ok' : 'WRONG'}: a11y added from the catalog and pinned (${pinned?.version}), its check approved in the Lookout (${approved}); the claim carried the role with ${role?.checklist.length} checklist items; completion refused without them, then ${done.status} with checks ${ran}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await worker.client.close();
    await page.close();
    server.kill('SIGTERM');
    catalog.server.close();
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
