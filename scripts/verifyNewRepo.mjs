// A new repo, end to end (verify-mcp.mjs): a scratch git repo with only a README. Repo readiness says it is new; the
// trail is verified with checks; the agent charts "Set up the project" (setup: true), which readiness doesn't hold
// while the feature waits for it; the agent writes a package.json and a test, proposes the checks (propose_checks),
// and its completion waits; the trail lead approves the checks in Settings → Approvals, and that same completion goes
// on by itself: it runs them on the setup work and closes verified; once that work is on main, the feature opens with the checks in force. Waits on what the user sees.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { approveSkipInLookout, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { stopProcess } from './stopProcess.mjs';
import { mainChecksAgent, startMainChecksServer } from './verifyMainChecks.mjs';

/** A git repo with a README and nothing else: no project yet. */
function newRepo() {
  const top = path.join(e2eTemp('teamtrail-newrepo-e2e-'), 'app');
  fs.mkdirSync(top, { recursive: true });
  fs.writeFileSync(path.join(top, 'README.md'), '# App\n');
  fs.writeFileSync(path.join(top, '.gitignore'), '.teamtrail\n');
  const git = (...a) =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@teamtrail', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return { top, git };
}

/** The setup work: an npm project with one passing test. Its agent proposes the checks over MCP. */
function setUp(top) {
  const write = (rel, text) => fs.writeFileSync(path.join(top, rel), text);
  fs.mkdirSync(path.join(top, 'test'), { recursive: true });
  write('package.json', `${JSON.stringify({ name: 'app', private: true, scripts: { test: 'node --test' } })}\n`);
  write('test/ok.test.js', "require('node:test')('ok', () => {});\n");
}

/**
 * The trail lead approves the proposed check commands in Settings → Approvals, shown as command lines. `before` runs
 * once the item shows, just before Approve.
 */
async function approveInSettings(page, url, before = () => {}) {
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  const shown = await row.getByText('test: npm test').isVisible();
  before();
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
  return shown;
}

/** Settings → Project → Repo readiness says the repo is new. */
async function readinessSaysNew(page, url) {
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=readiness`);
  return page
    .locator('#settings-readiness')
    .getByText('New repo: the first ticket sets it up')
    .waitFor({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
}

export async function verifyNewRepo({ browser, cli, log, shots }) {
  const { top, git } = newRepo();
  const { server, url, pair } = await startMainChecksServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const agent = await mainChecksAgent(cli, top);
  try {
    await signInWith(page, pair);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached' });
    const started = await approveSkipInLookout({
      started: await agent.call('start_trail', {
        discovery: false,
        title: 'App',
        destination: 'A tiny app',
        tickets: [{ ref: 'f', title: 'First feature', type: 'task' }],
      }),
      page,
      url,
    });
    const mapId = started.trail.id;
    const feature = started.tickets.find((t) => t.title === 'First feature').key;
    const told = /Set up the project/.test(started.readiness?.newRepo ?? '') && started.trail.verification === 'checks';
    const isNew = await readinessSaysNew(page, url);
    await shootThemes(page, shots, 'new-repo-readiness');

    const setup = (
      await agent.call('add_ticket', { trail: mapId, title: 'Set up the project', type: 'task', setup: true })
    ).ticket;
    const offered = (await agent.call('next_ticket', { trail: mapId })).ticket?.key === setup.key;
    await agent.call('claim_ticket', { trail: mapId, ticket: setup.key });
    setUp(top);
    const proposal = await agent.call('propose_checks', {
      trail: mapId,
      ticket: setup.key,
      checks: [{ name: 'test', run: ['npm', 'test'] }],
    });
    const proposed = proposal.proposed?.includes('test: npm test');
    // the completion waits for the approval in the same call, and goes on by itself once it's given
    let settled = false;
    const closing = agent
      .call('close_ticket', { trail: mapId, ticket: setup.key, resolution: 'Skeleton, a test', waitSeconds: 120 })
      .finally(() => (settled = true));
    let waits = false;
    const shown = await approveInSettings(page, url, () => (waits = !settled));
    const done = await closing;
    const verified = done.closed === setup.key;

    git('add', '-A');
    git('commit', '-qm', 'Set up the project');
    const next = await agent.call('next_ticket', { trail: mapId, wait: true, waitSeconds: 120 });
    const opened = next.ticket?.key === feature;

    const ok = told && isNew && offered && proposed && waits && shown && verified && opened && !errors.length;
    log(
      `new repo ${ok ? 'ok' : 'WRONG'}: told to chart setup, trail at checks (${told}), readiness says new (${isNew}); setup ${setup.key} offered first (${offered}); checks proposed (${proposed}); its completion waits for approval (${waits}); approved as command lines (${shown}); closed verified (${verified}, ${done.status ?? done.closed}); on main the feature ${feature} opens (${opened}${opened ? '' : `: ${next.nextReason}`})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await agent.client.close();
    await page.close();
    await stopProcess(server);
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
