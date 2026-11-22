// Linking a pull request by hand, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo against
// the fake GitHub pulls API from the core tests (packages/core/test/fakes/githubPulls.ts) served over HTTP: a ticket
// linked to PR #7 by its branch; in the full ticket, Link a different PR lists the repo's PRs, a link to another repo
// is refused with why, picking #8 shows it in the block at once, Unlink removes it, and both are in the journal.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { build } from 'esbuild';
import { approveSkipInLookout, clickNode, lookoutLinks, openFullTicket, signInWith } from './e2eHelpers.mjs';
import { stopProcess } from './stopProcess.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHA = 'e'.repeat(40);

/** The pulls fake, bundled for plain node and served on a free port, with PRs #7 and #8 open. */
async function serveFake(top) {
  const fakes = path.resolve(here, '../packages/core/test/fakes');
  await build({
    entryPoints: [path.join(fakes, 'githubPulls.ts')],
    outdir: path.join(top, 'fakes'),
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
  });
  const { fakeGitHubPulls } = await import(pathToFileURL(path.join(top, 'fakes', 'githubPulls.mjs')).href);
  const gh = fakeGitHubPulls({ repo: 'octo-org/launchpad' });
  gh.open(7, { sha: SHA, ref: 'teamtrail/first', title: 'First try at the export' });
  gh.open(8, { sha: SHA, ref: 'teamtrail/second', title: 'The export, done again' });
  const server = http.createServer(async (req, res) => {
    const r = await gh.fetch(`http://fake${req.url}`, { method: req.method, headers: req.headers });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function scratchRepo() {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-prlink-e2e-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  fs.mkdirSync(path.join(top, '.teamtrail'));
  fs.writeFileSync(path.join(top, 'README.md'), '# app\n');
  // a site already, not a new repo (which would start with its setup ticket): a page at the top
  fs.writeFileSync(path.join(top, 'index.html'), '<h1>app</h1>\n');
  git('init', '-q', '-b', 'main');
  git('remote', 'add', 'origin', 'git@github.com:octo-org/launchpad.git');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

async function startLookout(cli, cwd, env) {
  const proc = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
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

async function agent(cli, cwd, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    stderr: 'pipe',
    env,
  });
  const client = new Client({ name: 'prlink-agent', version: '1.0.0' });
  await client.connect(transport);
  const call = async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

/** The ticket linked to PR #7 by its branch, as the reconciler would have written it. */
function linkedByBranch({ root, mapId, ticketId, key }) {
  const at = Date.now();
  const pr = { number: 7, url: 'https://github.com/octo-org/launchpad/pull/7', title: 'First try at the export' };
  const sync = {
    ...{ v: 1, mapId, ticketId, ticketKey: key, provider: 'github', link: { number: 7, source: 'branch', at } },
    pr: { ...pr, state: 'open', draft: false, headSha: SHA, headRef: 'teamtrail/first', sameRepo: true },
    ...{ checks: [], checksSummary: 'none', flags: [], syncedAt: at },
  };
  Object.assign(sync.pr, { review: 'none', mergeable: 'clean', updatedAt: at });
  const dir = path.join(root, '.evidence', mapId, ticketId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sync.json'), JSON.stringify(sync));
}

const seen = (locator, timeout = 15_000) =>
  locator.waitFor({ timeout }).then(
    () => true,
    () => false,
  );

/** In the open full ticket: refused for another repo, #8 picked from the list, then unlinked. */
async function relink(page, shots) {
  const shoot = (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });
  const drawer = page.locator('.ticket-drawer');
  const first = await seen(drawer.locator('.pr-block', { hasText: 'PR #7' }));
  await drawer.getByRole('button', { name: 'Link a different PR' }).click();
  const row = drawer.locator('.pr-choices li', { hasText: '#8' });
  const listed = await seen(row);
  await drawer.getByLabel('Pull request number or link').fill('https://github.com/other-org/app/pull/8');
  await drawer.getByRole('button', { name: 'Link', exact: true }).click();
  const refused = await seen(drawer.locator('.pr-link-error', { hasText: 'other-org/app' }));
  await shoot('pr-link-picker');
  await row.locator('.ds-row-main').click();
  const linked = await seen(drawer.locator('.pr-block', { hasText: 'The export, done again' }), 5_000);
  await shoot('pr-link-linked');
  await drawer.getByRole('button', { name: 'Unlink' }).click();
  const unlinked = await seen(drawer.locator('.pr-block'), 5_000).then(async () =>
    drawer
      .locator('.pr-block')
      .waitFor({ state: 'detached', timeout: 5_000 })
      .then(
        () => true,
        () => false,
      ),
  );
  return { first, listed, refused, linked, unlinked };
}

export async function verifyPrLink({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const fake = await serveFake(top);
  const env = {
    ...process.env,
    TEAMTRAIL_GITHUB_API: fake.url,
    GITHUB_TOKEN: 'ghp_e2e_fake_pulls',
    TEAMTRAIL_NO_GH_CLI: '1',
  };
  const lookout = await startLookout(cli, top, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await agent(cli, top, env);
  try {
    await signInWith(page, lookout.pair);
    const onboarding = page.getByRole('button', { name: 'Get started' });
    if (await seen(onboarding, 5_000)) await onboarding.click();
    const started = await one.call('start_trail', {
      discovery: false,
      title: 'Export',
      destination: 'People can export their data',
      tickets: [{ ref: 'csv', title: 'Export rows as CSV', type: 'task' }],
    });
    await approveSkipInLookout({ started, page, url: lookout.url });
    const key = started.tickets?.[0]?.key ?? '#1';
    const mapId = started.trail.id;
    const ticketId = key.replace('#', '');
    linkedByBranch({ root: path.join(top, '.teamtrail'), mapId, ticketId, key });
    await page.goto(lookout.url);
    await clickNode(page, page.locator('.node', { hasText: 'Export rows as CSV' }));
    await openFullTicket(page);
    const r = await relink(page, shots);
    const journal = fs.readFileSync(path.join(top, '.teamtrail', '.events', `${mapId}.jsonl`), 'utf8');
    const logged = journal
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((e) => e.kind === 'pr-link')
      .map((e) => `${e.action} ${e.pr}`)
      .join(', ');
    const ok = Object.values(r).every(Boolean) && logged === 'linked 8, unlinked 8' && !errors.length;
    log(
      `PR hand link ${ok ? 'ok' : 'WRONG'}: ${JSON.stringify(r)}, journal "${logged}"${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    await stopProcess(lookout.proc);
    fake.server.close();
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
