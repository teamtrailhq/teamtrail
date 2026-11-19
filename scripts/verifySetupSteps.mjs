// Setup steps, end to end (verify-mcp.mjs), on a scratch npm workspace whose check imports a workspace package: the
// trail lead sees the setup step in Settings → Approvals and approves it; on a commit without a lockfile Teamtrail
// won't run the install, so checks on main couldn't run on this machine, which holds no work; once the lockfile is
// committed, Run again installs it in the worktree for main and the check passes there, importing the committed
// package, never the person's working tree. Waits on what the user sees, never on sleeps.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { approveSkipInLookout, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { mainChecksAgent, startMainChecksServer } from './verifyMainChecks.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const commit = (top, m, files = ['-A']) => {
  sh(top, 'add', ...files);
  sh(top, '-c', 'user.email=e2e@teamtrail', '-c', 'user.name=e2e', 'commit', '-qm', m);
};

const LOCK = {
  name: 'root',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'root', workspaces: ['packages/*'] },
    'node_modules/@x/lib': { resolved: 'packages/lib', link: true },
    'packages/lib': { name: '@x/lib', version: '1.0.0' },
  },
};

function scratchRepo() {
  const top = path.join(e2eTemp('teamtrail-setup-e2e-'), 'app');
  const write = (rel, v) => {
    fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
    fs.writeFileSync(path.join(top, rel), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  };
  write('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
  write('packages/lib/package.json', { name: '@x/lib', version: '1.0.0', main: 'index.js' });
  write('packages/lib/index.js', "module.exports = 'committed';\n");
  write(
    'check.js',
    "const v = require('@x/lib'); console.log('lib is ' + v); process.exit(v === 'committed' ? 0 : 1);\n",
  );
  write('.gitignore', 'node_modules\n.teamtrail\n');
  write('.teamtrail/verification.json', {
    v: 1,
    default: 'checks',
    setup: { deps: { run: ['npm', 'ci', '--offline', '--no-audit', '--no-fund'] } },
    checks: { test: { run: ['node', 'check.js'] } },
    run: ['test'],
  });
  sh(top, 'init', '-q', '-b', 'main');
  commit(top, 'init');
  // the person's uncommitted work, which checks on main must never see
  write('packages/lib/index.js', "module.exports = 'uncommitted';\n");
  return { top, write };
}

/** Settings → Approvals shows the setup step as its exact argv; the trail lead approves it with the checks. */
async function approveWithSetup(page, url) {
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  const again = page.getByRole('button', { name: 'Get started' });
  if (await again.isVisible()) await again.click();
  // the file isn't committed here, so it is shown whole: the setup step with its exact argv
  const lines = await row.locator('.ap-lines').innerText();
  const shown = /"setup"/.test(lines) && /"npm",\s*"ci"/.test(lines);
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ap-none').waitFor({ timeout: 15_000 });
  await page.goto(url);
  return shown;
}

export async function verifySetupSteps({ browser, cli, log, shots }) {
  const { top, write } = scratchRepo();
  const { server, url, pair } = await startMainChecksServer(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const one = await mainChecksAgent(cli, top);
  try {
    await signInWith(page, pair);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    const shown = await approveWithSetup(page, url);
    const started = await approveSkipInLookout({
      started: await one.call('start_trail', {
        discovery: false,
        title: 'Lib',
        destination: 'The lib is used',
        tickets: [{ ref: 'use', title: 'Use the lib', type: 'task' }],
      }),
      page,
      url,
    });
    const mapId = started.trail.id;

    // no lockfile on main: the install isn't run, checks couldn't run here, and the task is offered all the same
    const offered = await one.call('next_ticket', { trail: mapId, types: ['task'] });
    const notHeld = offered.ticket !== null && !offered.mainChecks?.waits;
    await page.locator('.node.main-mark').click();
    const section = page.locator('.bubble .main-checks');
    await section.getByText("Checks on main couldn't run on this machine").waitFor({ timeout: 20_000 });
    const why = await section.getByText(/no package-lock\.json or npm-shrinkwrap\.json/).isVisible();
    if (shots) await page.screenshot({ path: path.join(shots, '17b-main-checks-environment.png') });

    // with the lockfile committed, Run again installs in the worktree for main and the check passes on the commit
    write('package-lock.json', LOCK);
    commit(top, 'lockfile', ['package-lock.json']);
    await section.getByRole('button', { name: 'Run again' }).click();
    await section.getByText('Checks pass on main').waitFor({ timeout: 60_000 });
    const untouched = !fs.existsSync(path.join(top, 'node_modules'));

    const ok = shown && notHeld && why && untouched && !errors.length;
    log(
      `setup steps ${ok ? 'ok' : 'WRONG'}: shown in Approvals (${shown}), no lockfile → couldn't run on this machine (${why}), task not held (${notHeld}), lockfile → checks pass on main, person's checkout untouched (${untouched})${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(path.dirname(top), { recursive: true, force: true });
  }
}
