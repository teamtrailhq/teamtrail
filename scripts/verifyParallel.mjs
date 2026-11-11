// M3 steps of the end-to-end check (verify-mcp.mjs), on their own scratch git repo with worktrees on: two agents
// claim overlapping files, get their own worktrees, change the same file, and the trail lead adds the integration
// ticket from the Lookout. Waits on what the user sees, never on sleeps.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { skipDiscoveryInLookout } from './e2eHelpers.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A project repo with one commit and worktrees switched on in its tracker folder. */
function scratchRepo() {
  const top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-parallel-e2e-')), 'app');
  fs.mkdirSync(path.join(top, 'src', 'search'), { recursive: true });
  fs.mkdirSync(path.join(top, '.teamtrail'));
  fs.writeFileSync(path.join(top, 'src', 'search', 'index.ts'), 'export const search = () => [];\n');
  fs.writeFileSync(path.join(top, '.teamtrail', 'workspaces.json'), JSON.stringify({ v: 1, worktrees: true }));
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'add', '-A');
  sh(top, '-c', 'user.email=e2e@teamtrail', '-c', 'user.name=e2e', 'commit', '-qm', 'init');
  return top;
}

async function startServer(cli, cwd) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], {
    cwd,
    env: { ...process.env, TEAMTRAIL_INTEGRATION_POLL_MS: '1000' },
  });
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

/** Commits a change to the same file in a claim's worktree, as the agent would. */
function changeShared(ws, who) {
  fs.writeFileSync(path.join(ws.path, 'src', 'search', 'index.ts'), `export const search = () => ['${who}'];\n`);
  sh(ws.path, '-c', 'user.email=e2e@teamtrail', '-c', 'user.name=e2e', 'commit', '-qam', `search by ${who}`);
}

export async function verifyParallel({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const { server, url } = await startServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top);
  const two = await agent(cli, top);
  try {
    await page.goto(url);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    await one.call('start_trail', {
      discovery: false,
      questionId: await skipDiscoveryInLookout({ call: one.call, page, url }),
      title: 'Release search',
      destination: 'Readers find a release in seconds',
      tickets: [
        { ref: 'box', title: 'Search box on the changelog', type: 'task' },
        { ref: 'rank', title: 'Rank results by version', type: 'task' },
      ],
    });
    const a = await one.call('claim_ticket', { touches: ['src/search/**'] });
    const b = await two.call('claim_ticket', { touches: ['src/search/index.ts'] });
    const warned = b.warnings?.[0]?.ticket === a.claimed.key;
    const onDisk = [a, b].every(
      (c) => c.workspace && sh(c.workspace.path, 'rev-parse', '--abbrev-ref', 'HEAD') === c.workspace.branch,
    );
    await page.locator('.attention-queue li.att-item.k-overlap').waitFor({ timeout: 20_000 });
    if (shots) await page.screenshot({ path: path.join(shots, '14-overlap.png') });

    changeShared(a.workspace, 'box');
    changeShared(b.workspace, 'rank');
    const integration = page.locator('.attention-queue li.att-item.k-integration');
    await integration.waitFor({ timeout: 30_000 });
    const files = (await integration.textContent()) ?? '';
    if (shots) await page.screenshot({ path: path.join(shots, '15-integration.png') });
    await integration.locator('.integration-add').click();
    await integration.waitFor({ state: 'detached', timeout: 20_000 });
    await page.locator('.fit-btn').click();
    await page.locator('.node', { hasText: 'Bring together' }).first().waitFor({ timeout: 15_000 });
    if (shots) await page.screenshot({ path: path.join(shots, '16-integration-ticket.png') });

    const ticketsDir = path.join(
      top,
      '.teamtrail',
      fs
        .readdirSync(path.join(top, '.teamtrail'))
        .find((d) => fs.existsSync(path.join(top, '.teamtrail', d, 'tickets'))),
      'tickets',
    );
    const added = fs
      .readdirSync(ticketsDir)
      .map((f) => fs.readFileSync(path.join(ticketsDir, f), 'utf8'))
      .find((t) => /^title: Bring together/m.test(t));
    const blockedBy = added?.match(/^blocked_by: (.*)$/m)?.[1] ?? '';
    const ids = [a, b].map((c) => c.claimed.id ?? c.claimed.key.replace('#', ''));
    const blockedByBoth = ids.every((id) => blockedBy.includes(`"${id}"`));
    const ok = warned && onDisk && /index\.ts/.test(files) && blockedByBoth && !errors.length;
    log(
      `parallel work ${ok ? 'ok' : 'WRONG'}: ${b.claimed.key} warned about ${a.claimed.key} (${warned}), worktrees on their branches (${onDisk}), integration item for the shared file, ticket added blocked by both (${blockedBy})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await two.client.close();
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
