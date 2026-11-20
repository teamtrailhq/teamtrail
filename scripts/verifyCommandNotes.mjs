// The project's commands, end to end (verify-mcp.mjs), on a scratch npm workspace (the web app in apps/web): the
// Field guide's "Suggest build and test notes" reads the repo and suggests one note per package; a claim touching
// apps/web says its note waits for the trail lead; once they confirm it in the Lookout, the next claim carries it
// (install, test, run), with what its tests need. Waits on what the user sees, never on sleeps.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { approveSkipInLookout, lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { stopProcess } from './stopProcess.mjs';

/** A git repo with npm workspaces: apps/web tests with karma and runs with vite. */
function scratchWorkspace() {
  const top = path.join(e2eTemp('teamtrail-commands-e2e-'), 'shop');
  const write = (rel, json) => {
    fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
    fs.writeFileSync(path.join(top, rel), `${JSON.stringify(json, null, 2)}\n`);
  };
  write('package.json', { name: 'shop', private: true, workspaces: ['apps/*'] });
  write('package-lock.json', { name: 'shop', lockfileVersion: 3, packages: {} });
  write('apps/web/package.json', {
    name: 'web',
    scripts: { test: 'karma start', dev: 'vite' },
    devDependencies: { karma: '6.4.0' },
  });
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

async function startLookout(cli, cwd) {
  const proc = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd });
  const links = await new Promise((resolve, reject) => {
    let out = '';
    const read = (c) => {
      out += c;
      const found = lookoutLinks(out);
      if (found) resolve(found);
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', read);
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
  return { client, call };
}

/** Records → Field guide, Suggest build and test notes, then Confirm on apps/web's note as shown. */
async function confirmWebNote(page, shots) {
  await page.getByRole('button', { name: /^Records/ }).click();
  await page.locator('.knowledge-btn').click();
  const view = page.locator('.knowledge-view');
  await view.getByRole('button', { name: 'Suggest build and test notes' }).click();
  await view.locator('.kn-commands', { hasText: '2 notes to review' }).waitFor({ timeout: 15_000 });
  const row = view.locator('.kn-row', { hasText: 'How to build and test apps/web' });
  await row.waitFor({ timeout: 15_000 });
  await row.click();
  await shootThemes(page, shots, 'command-notes');
  const body = await view.locator('.kn-detail, .knowledge-detail').first().innerText();
  await view.getByRole('button', { name: 'Confirm', exact: true }).click();
  await view.getByRole('button', { name: 'Confirmed' }).click();
  await view.locator('.kn-row', { hasText: 'How to build and test apps/web' }).waitFor({ timeout: 15_000 });
  return body;
}

export async function verifyCommandNotes({ browser, cli, log, shots }) {
  const top = scratchWorkspace();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const one = await agent(cli, top);
  try {
    await signInWith(page, lookout.pair);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
    const started = await approveSkipInLookout({
      started: await one.call('start_trail', {
        discovery: false,
        title: 'Search',
        destination: 'Shoppers find a product',
        tickets: [{ ref: 'box', title: 'Search box', type: 'task' }],
      }),
      page,
      url: lookout.url,
    });
    const key = started.tickets[0].key;
    const claim = () => one.call('claim_ticket', { ticket: key, trail: started.trail.id, touches: ['apps/web/**'] });
    const before = (await claim()).commands?.[0];
    const waited = before?.package === 'apps/web' && !before.notes && /^No confirmed notes/.test(before.waiting ?? '');
    const shown = await confirmWebNote(page, shots);
    const after = (await claim()).commands?.[0];
    const body = after?.notes?.body ?? '';
    const carried =
      after?.notes?.status === 'confirmed' &&
      body.includes('- Install: `npm ci` in the top folder') &&
      body.includes('- Test: `npm test` in apps/web') &&
      body.includes('- Run: `npm run dev` in apps/web') &&
      shown.includes('npm test');
    const needs = after?.needs?.some((n) => n.kind === 'browser' && n.name === 'karma');
    const ok = waited && carried && needs;
    log(
      `project commands ${ok ? 'ok' : 'WRONG'}: before confirming ${waited ? 'the claim said the note waits' : `WRONG ${JSON.stringify(before)}`}; suggested in the Field guide and confirmed; the next claim ${carried ? `carried ${after.notes.id}` : `WRONG ${JSON.stringify(after)}`}${needs ? ', needs a browser (karma)' : ', NEEDS MISSING'}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    await stopProcess(lookout.proc);
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
