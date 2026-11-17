// Check screening step of the end-to-end check (verify-mcp.mjs), on its own scratch repo: in Settings → Verification,
// a check whose script isn't in package.json is said to be one that won't run, next to it, before anything is saved,
// with Remove check and Keep anyway; keeping it hides the warning. Nothing runs. Waits on what the user sees.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';

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

/** A git repo whose package.json has a `test` script and no other. */
function scratchRepo() {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-screen-e2e-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }, null, 2));
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
    await editor.getByRole('button', { name: '+ Another' }).click();
    // by position: rows added later come after it
    const row = editor.locator('.vf-edit-check').nth((await editor.locator('.vf-edit-check').count()) - 1);
    await row.getByLabel('Name').fill('nope');
    await row.getByLabel('Command').fill('npm run nope');
    const warning = row.locator('.vf-finding', { hasText: 'No nope script in package.json' });
    await warning.waitFor({ timeout: 15_000 });
    const said = (await warning.textContent()) ?? '';
    const offered =
      (await row.getByRole('button', { name: 'Remove check' }).isVisible()) &&
      (await row.getByRole('button', { name: 'Keep anyway' }).isVisible());
    await shootThemes(page, shots, 'check-screening');
    // a check whose script is there says nothing
    const screened = page.waitForResponse((r) => r.url().includes('/verification/screen') && r.ok());
    await editor.getByRole('button', { name: '+ npm test' }).click();
    await screened;
    const passing = editor.locator('.vf-edit-check').last().locator('.vf-finding');
    const quiet = (await passing.count()) === 0;
    await row.getByRole('button', { name: 'Keep anyway' }).click();
    await warning.waitFor({ state: 'detached', timeout: 15_000 });
    const ok = said.startsWith("Won't run") && offered && quiet;
    log(
      `check screening ${ok ? 'ok' : 'WRONG'}: "${said}" next to npm run nope, Remove check and Keep anyway ${offered ? 'offered' : 'MISSING'}, npm test ${quiet ? 'quiet' : 'warned'}, kept anyway hides it`,
    );
    return ok;
  } finally {
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
