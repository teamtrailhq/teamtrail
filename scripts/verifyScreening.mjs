// Check screening step of the end-to-end check (verify-mcp.mjs), on its own scratch repo: in Settings → Verification,
// a check whose script isn't in package.json is said to be one that won't run, under its command, before anything is
// saved; `npm web:lint` (no such npm command) offers `npm run web:lint` as its one action, which rewrites the command
// and quiets the warning; a script that starts `ng` from a dependency nobody installed says `ng` isn't installed, with
// the install to run. Nothing runs. Waits on what the user sees.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { stopProcess } from './stopProcess.mjs';

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

/** A git repo whose package.json has `test`, `web:lint` and `ng:test` scripts, `ng` from a dependency not installed. */
function scratchRepo() {
  const top = e2eTemp('teamtrail-screen-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(
    path.join(top, 'package.json'),
    JSON.stringify(
      {
        scripts: { test: 'node --test', 'web:lint': 'node --test', 'ng:test': 'ng test' },
        devDependencies: { '@angular/cli': '^19.0.0' },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(top, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

export async function verifyScreening({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await signInWith(page, lookout.pair);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.goto(`${lookout.url}${lookout.url.includes('?') ? '&' : '?'}settings=verification`);
    // the reload can come before onboarding's "done" is saved: dismiss it again rather than race its scrim
    const again = page.getByRole('button', { name: 'Get started' });
    if (await again.isVisible()) await again.click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
    const editor = page.locator('.vf-editor');
    const rows = editor.locator('.vf-edit-check');
    /** Adds a check with Add check and fills it in; by position, since rows added later come after it. */
    const add = async (name, command) => {
      const at = await rows.count();
      await editor.getByRole('button', { name: 'Add check', exact: true }).click();
      const row = rows.nth(at);
      await row.getByLabel('Name').fill(name);
      await row.getByLabel('Command').fill(command);
      return row;
    };
    const nope = await add('nope', 'npm run nope');
    const warning = nope.locator('.cs-finding', { hasText: 'No nope script in package.json' });
    await warning.waitFor({ timeout: 15_000 });
    const said = (await warning.textContent()) ?? '';
    // no action without a known fix: Remove is the row's own
    const quietRow = (await nope.locator('.cs-finding button').count()) === 0;
    const lint = await add('web-lint', 'npm web:lint');
    const use = lint.getByRole('button', { name: 'Use npm run web:lint' });
    await use.waitFor({ timeout: 15_000 });
    await shootThemes(page, shots, 'check-screening');
    await use.click();
    const fixed = (await lint.getByLabel('Command').inputValue()) === 'npm run web:lint';
    await lint.locator('.cs-finding').waitFor({ state: 'detached', timeout: 15_000 });
    // a check whose script is there says nothing
    const screened = page.waitForResponse((r) => r.url().includes('/verification/screen') && r.ok());
    await add('test', 'npm test');
    await screened;
    const quiet = (await rows.last().locator('.cs-finding').count()) === 0;
    // a dependency that isn't installed is its own reason, with the install that fixes it
    const ng = await add('ng', 'npm run ng:test');
    const missing = ng.locator('.cs-finding', { hasText: "ng isn't installed: no node_modules" });
    await missing.waitFor({ timeout: 15_000 });
    const notInstalled = /install the dependencies first \(npm ci\)/.test((await missing.textContent()) ?? '');
    await shootThemes(page, shots, 'check-screening-not-installed');
    await nope.getByRole('button', { name: 'Remove nope' }).click();
    await warning.waitFor({ state: 'detached', timeout: 15_000 });
    const ok = said.startsWith("Won't run") && quietRow && fixed && quiet && notInstalled;
    log(
      `check screening ${ok ? 'ok' : 'WRONG'}: "${said}" under npm run nope (${quietRow ? 'no action' : 'AN ACTION'}), Use npm run web:lint ${fixed ? 'rewrote the command' : 'DID NOTHING'}, npm test ${quiet ? 'quiet' : 'warned'}, npm run ng:test ${notInstalled ? 'not installed, with npm ci' : 'NOT SAID'}, Remove nope removes it`,
    );
    return ok;
  } finally {
    await page.close();
    await stopProcess(lookout.proc);
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
