// Finished with no checks set, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo with no
// verification.json: an agent finishes a task, which closes with nothing checked. Its proof says so plainly ("Finished
// with no checks set: nothing was checked."), never "No completion was submitted", and its next step is Set checks,
// which opens Settings → Verification.
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
  sessionHeaders,
  shootThemes,
  signInWith,
} from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { stopProcess } from './stopProcess.mjs';

const GAP = 'Finished with no checks set: nothing was checked.';

function scratchRepo() {
  const top = e2eTemp('teamtrail-no-checks-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  fs.writeFileSync(path.join(top, 'README.md'), '# app\n');
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

export async function verifyNoChecksGap({ browser, cli, log, shots }) {
  const top = scratchRepo();
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
    const ticketId = claimed.claimed.id ?? key.replace('#', '');
    fs.writeFileSync(path.join(top, 'hero.md'), '# Ship work you can trust\n');
    const closed = await one.call('close_ticket', { ticket: key, resolution: 'Wrote the hero copy' });
    // the proof as the Lookout reads it: the gap's line and who closes it
    const q = new URLSearchParams({ mapId: started.trail.id, ticketId });
    const api = new URL(`/__teamtrail/proof/ticket?${q}`, lookout.url).href;
    const view = await (await page.request.get(api, { headers: await sessionHeaders(page) })).json();
    const planned = view.plan?.[0];
    const lineOk = view.proof?.gaps?.[0] === GAP && planned?.kind === 'finished-unchecked';
    const actionOk = planned?.owner === 'you' && planned?.action === 'set-checks';
    // the full ticket says it, and Set checks opens Settings → Verification
    await page.goto(lookout.url);
    await page.locator('.node', { hasText: 'Write the hero copy' }).first().click();
    await page.locator('.bubble').waitFor({ timeout: 15_000 });
    const bubblePrimary = await page.locator('.bubble .action-bar .btn').first().innerText();
    await openFullTicket(page);
    const proof = page.locator('.ticket-drawer .ticket-proof', { hasText: 'Not verified' });
    await proof.getByText(GAP).waitFor({ timeout: 15_000 });
    await proof.scrollIntoViewIfNeeded();
    await shootThemes(page, shots, 'proof-no-checks');
    await proof.getByRole('button', { name: 'Set checks' }).click();
    const settings = await page.waitForURL(/[?&]settings=verification/, { timeout: 15_000 }).then(
      () => true,
      () => false,
    );
    const ok =
      closed.closed === key && lineOk && actionOk && bubblePrimary === 'Set checks' && settings && !errors.length;
    log(
      `finished with no checks set ${ok ? 'ok' : 'WRONG'}: ${key} closed (${closed.closed ?? JSON.stringify(closed)}), its proof says "${view.proof?.gaps?.[0]}" (${planned?.kind}, ${planned?.owner}, ${planned?.action}), the bubble leads with ${bubblePrimary}, Set checks opened Settings → Verification (${settings})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    await stopProcess(lookout.proc);
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
