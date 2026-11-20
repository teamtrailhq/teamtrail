// Variables checks can read, a step of the end-to-end check (verify-mcp.mjs), on its own scratch repo whose
// .env.example names DATABASE_URL and STRIPE_SECRET_KEY: Settings → Verification lists them as names the tests may
// read, not passed to checks; "Let checks read it" adds DATABASE_URL on this machine (the machine store, never the
// repo), and the row says checks get it. A name typed in is added too. No value is ever on the page or in a file
// Teamtrail wrote, though the Lookout's own environment has one. Waits on what the user sees.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const VALUE = 'postgres://e2e-value-never-shown';

/** Starts the built Lookout in `cwd`, with DATABASE_URL set in its environment, and resolves with its links. */
async function startLookout(cli, cwd) {
  const env = { ...process.env, DATABASE_URL: VALUE };
  const proc = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
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

function scratchRepo() {
  const top = e2eTemp('teamtrail-variables-e2e-');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: top });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(top, 'package.json'), '{ "name": "shop", "scripts": { "test": "node --test" } }\n');
  fs.writeFileSync(path.join(top, '.env.example'), 'DATABASE_URL=postgres://localhost/shop\nSTRIPE_SECRET_KEY=\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return top;
}

/** Every file under `dir` whose text holds `text`. */
function filesHolding(dir, text) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile() && fs.readFileSync(f, 'utf8').includes(text));
}

export async function verifyCheckVariables({ browser, cli, log, shots }) {
  const top = scratchRepo();
  const lookout = await startLookout(cli, top);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await signInWith(page, lookout.pair);
    await page.locator('.dialog.onboarding').waitFor();
    await page.goto(`${lookout.url}${lookout.url.includes('?') ? '&' : '?'}settings=verification`);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
    const section = page.locator('.cv');
    const db = section.locator('.ds-row', { hasText: 'DATABASE_URL' });
    await db.getByText('Not passed to checks').waitFor({ timeout: 15_000 });
    const stripe = await section.locator('.ds-row', { hasText: 'STRIPE_SECRET_KEY' }).innerText();
    await db.hover();
    await db.getByRole('button', { name: 'Let checks read it' }).click();
    await db.getByText('Checks get it').waitFor({ timeout: 15_000 });
    await section.getByLabel('Variable name').fill('REDIS_URL');
    await section.getByRole('button', { name: 'Add' }).click();
    await section.locator('.ds-row', { hasText: 'REDIS_URL' }).getByText('Added on this machine').waitFor();
    await shootThemes(page, shots, 'check-variables');
    const pageText = await page.locator('body').innerText();
    const store = filesHolding(process.env.TEAMTRAIL_CONFIG_DIR, '"REDIS_URL"').filter((f) =>
      f.endsWith('check-env.json'),
    );
    const inRepo = filesHolding(top, 'REDIS_URL').filter((f) => !f.includes(`${path.sep}.events${path.sep}`));
    const leaked = [...filesHolding(top, VALUE), ...filesHolding(process.env.TEAMTRAIL_CONFIG_DIR, VALUE)];
    const ok =
      /reads like a secret/.test(stripe) &&
      store.length === 1 &&
      !inRepo.length &&
      !leaked.length &&
      !pageText.includes(VALUE);
    log(
      `check variables ${ok ? 'ok' : 'WRONG'}: DATABASE_URL let through and passed; REDIS_URL added ${store.length === 1 ? 'in the machine store' : 'NOT IN THE MACHINE STORE'}${inRepo.length ? `, IN THE REPO: ${inRepo.join(', ')}` : ''}; STRIPE_SECRET_KEY ${/reads like a secret/.test(stripe) ? 'held back as secret-shaped' : `WRONG: ${stripe}`}; ${leaked.length || pageText.includes(VALUE) ? 'A VALUE LEAKED' : 'no value shown or written'}`,
    );
    return ok;
  } finally {
    await page.close();
    lookout.proc.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
