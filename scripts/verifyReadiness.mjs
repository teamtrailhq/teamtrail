// Repo readiness, end to end (verify-mcp.mjs), on a scratch git repo with tests but no checks, and a trail verified
// with checks: an agent's task waits (next_ticket says why, a claim by key is refused), the blocking item in Needs you
// opens Settings → Project → Repo readiness, Start anyway lets the agent take the task and Undo holds it again, and
// the suggested check added in one click (saved and approved) clears what blocked. Waits on what the user sees.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { approveSkipInLookout, openNeedsList, sessionHeaders, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { stopProcess } from './stopProcess.mjs';
import { mainChecksAgent, startMainChecksServer } from './verifyMainChecks.mjs';

/** An npm project with one passing test, committed, and no verification.json. */
function scratchRepo() {
  const top = path.join(e2eTemp('teamtrail-ready-e2e-'), 'app');
  fs.mkdirSync(path.join(top, 'test'), { recursive: true });
  const write = (rel, text) => fs.writeFileSync(path.join(top, rel), text);
  write('package.json', `${JSON.stringify({ name: 'app', private: true, scripts: { test: 'node --test' } })}\n`);
  write('package-lock.json', `${JSON.stringify({ name: 'app', lockfileVersion: 3, packages: {} })}\n`);
  write('test/ok.test.js', "require('node:test')('ok', () => {});\n");
  write('.gitignore', '.teamtrail\n');
  const git = (...a) =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@teamtrail', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

/** What next_ticket says about the trail's task: offered, or held by readiness and why. */
async function offer(call, mapId) {
  const r = await call('next_ticket', { trail: mapId, types: ['task'] });
  return { key: r.ticket?.key, waits: r.readiness?.waits };
}

async function refusedByKey(call, t) {
  return call('claim_ticket', { ticket: t.key, trail: t.mapId }).then(
    () => false,
    (e) => /Repo not ready/.test(e.message),
  );
}

/** The Hands-on queue item, blocking, opens the readiness screen with what blocks. */
async function openFromQueue(page) {
  // blocking once the trail's work is verified with checks (asked soon before that)
  const item = (await openNeedsList(page)).locator('li.att-item.k-readiness');
  const blocking = await item
    .and(page.locator('.u-blocking'))
    .waitFor({ timeout: 20_000 })
    .then(
      () => true,
      () => false,
    );
  await item.locator('.ds-row-main').click();
  const section = page.locator('#settings-readiness');
  await section.getByText("Teamtrail can't verify work yet: no checks").waitFor({ timeout: 15_000 });
  return { blocking, section };
}

export async function verifyReadiness({ browser, cli, log, shots }) {
  const top = scratchRepo();
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
        title: 'Header',
        destination: 'The page shows its header',
        tickets: [{ ref: 'build', title: 'Add the header', type: 'task' }],
      }),
      page,
      url,
    });
    const t = { mapId: started.trail.id, key: started.tickets[0].key };
    // the trail lead turns checks on for the trail, as Settings → Verification does: the task is now verified with
    // checks, and there are none
    await page.request.post(new URL('/__teamtrail/verification/action', url).href, {
      headers: await sessionHeaders(page),
      data: { action: 'level', mapId: t.mapId, level: 'checks' },
    });
    const held = await offer(agent.call, t.mapId);
    const heldOk = !held.key && /Repo not ready: Teamtrail can't verify work yet: no checks/.test(held.waits ?? '');
    const refused = await refusedByKey(agent.call, t);

    const { blocking, section } = await openFromQueue(page);
    await section.scrollIntoViewIfNeeded();
    await shootThemes(page, shots, 'repo-readiness');
    await section.getByRole('button', { name: 'Start anyway', exact: true }).click();
    await section.getByRole('button', { name: 'Undo start anyway' }).waitFor({ timeout: 15_000 });
    const free = await offer(agent.call, t.mapId);
    await section.getByRole('button', { name: 'Undo start anyway' }).click();
    await section.getByRole('button', { name: 'Start anyway', exact: true }).waitFor({ timeout: 15_000 });
    const again = await offer(agent.call, t.mapId);
    const startOk = free.key === t.key && !free.waits && !again.key && !!again.waits;

    // the suggested check, in one click: written to verification.json and approved, so nothing blocks any more
    await section.getByRole('button', { name: /^(Add the check|Use \d+ suggested checks)/ }).click();
    await section
      .getByText("Teamtrail can't verify work yet: no checks")
      .waitFor({ state: 'detached', timeout: 15_000 });
    const written = JSON.parse(fs.readFileSync(path.join(top, '.teamtrail', 'verification.json'), 'utf8'));
    const checks = Object.values(written.checks ?? {}).map((c) => c.run.join(' '));
    const fixed = await offer(agent.call, t.mapId);
    const fixOk = checks.includes('npm test') && !fixed.waits;

    const ok = heldOk && refused && blocking && startOk && fixOk && !errors.length;
    log(
      `repo readiness ${ok ? 'ok' : 'WRONG'}: task held with no checks (${heldOk}), claim by key refused (${refused}), blocking item (${blocking}) → Repo readiness; Start anyway → ${free.key ?? 'nothing'} offered, Undo → held (${startOk}); one click added ${checks.join(', ') || 'no check'} and nothing holds (${fixOk})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await agent.client.close();
    await page.close();
    await stopProcess(server);
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
