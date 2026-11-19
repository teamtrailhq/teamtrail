// Suggested checks step of the end-to-end check (verify-mcp.mjs), on its own scratch monorepo (npm workspaces, the
// web app in apps/web): Settings → Verification offers what the repo runs, read from its files, each with its
// folder; one click adds `npm test` in apps/web as a row whose Folder field is apps/web, screening reads that folder
// (its test script is there, so nothing is said), and Save writes the check with `cwd: "apps/web"`, approved. No
// npm-only defaults: a check the repo doesn't have is never offered. Waits on what the user sees.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

/** Starts the built Lookout in `cwd` and resolves with its address and sign-in link. */
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

/** A git repo with npm workspaces: nothing to run at the top, a test and a lint script in apps/web. */
function scratchMonorepo() {
  const top = e2eTemp('teamtrail-suggest-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  const write = (rel, json) => {
    fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
    fs.writeFileSync(path.join(top, rel), `${JSON.stringify(json, null, 2)}\n`);
  };
  write('package.json', { name: 'shop', private: true, workspaces: ['apps/*'] });
  write('package-lock.json', { name: 'shop', lockfileVersion: 3, packages: {} });
  write('apps/web/package.json', { name: 'web', scripts: { test: 'node --test', lint: 'node --test' } });
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

/** Opens Settings → Verification past the first-run dialog. */
async function openVerification(page, url) {
  await page.locator('.dialog.onboarding').waitFor();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=verification`);
  // the reload can come before onboarding's "done" is saved: dismiss it again rather than race its scrim
  const again = page.getByRole('button', { name: 'Get started' });
  if (await again.isVisible()) await again.click();
  await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
}

export async function verifyCheckSuggestions({ browser, cli, log, shots }) {
  const top = scratchMonorepo();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await signInWith(page, lookout.pair);
    await openVerification(page, lookout.url);
    const editor = page.locator('.vf-editor');
    const chip = editor.getByRole('button', { name: 'Add npm test in apps/web' });
    await chip.waitFor({ timeout: 15_000 });
    const offered = await editor.locator('.vf-suggestion').evaluateAll((els) => els.map((e) => e.ariaLabel));
    const noDefaults = (await editor.getByRole('button', { name: /typecheck/ }).count()) === 0;
    await shootThemes(page, shots, 'check-suggestions');
    const screened = page.waitForResponse((r) => r.url().includes('/verification/screen') && r.ok());
    await chip.click();
    const row = editor.locator('.vf-edit-check').last();
    const name = await row.getByLabel('Name').inputValue();
    const folder = await row.getByLabel('Folder').inputValue();
    await screened;
    const quiet = (await row.locator('.cs-finding').count()) === 0;
    const gone = (await chip.count()) === 0;
    await editor.getByLabel('I know what these commands run, and approve them').check();
    // saving approves: the editor then starts over on the approved file, so wait on the answer, then on the row
    const answer = page.waitForResponse(
      (r) => r.url().includes('/verification/config') && r.request().method() === 'PUT',
    );
    await editor.getByRole('button', { name: 'Save checks' }).click();
    const put = await answer;
    const approved = put.ok() && (await put.json()).approval?.state === 'approved';
    await editor.locator('.vf-edit-check input[aria-label="Folder"][value="apps/web"]').waitFor({ timeout: 15_000 });
    const written = JSON.parse(fs.readFileSync(path.join(top, '.teamtrail', 'verification.json'), 'utf8'));
    const saved =
      JSON.stringify(written.checks?.['web-test']) === JSON.stringify({ run: ['npm', 'test'], cwd: 'apps/web' });
    const ok = name === 'web-test' && folder === 'apps/web' && quiet && gone && noDefaults && saved && approved;
    log(
      `check suggestions ${ok ? 'ok' : 'WRONG'}: offered ${offered.join(' | ')}; one click added ${name} in ${folder || 'the top'} (${quiet ? 'screened in its folder, quiet' : 'WARNED'}, ${gone ? 'chip gone' : 'CHIP STILL THERE'}), ${noDefaults ? 'no npm defaults' : 'NPM DEFAULTS OFFERED'}, saved ${saved ? 'with cwd apps/web' : `WRONG: ${JSON.stringify(written.checks)}`}, ${approved ? 'approved' : `NOT APPROVED (${put.status()})`}`,
    );
    return ok;
  } finally {
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
