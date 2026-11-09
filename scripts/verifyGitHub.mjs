// GitHub Issues steps of the end-to-end check (verify-mcp.mjs), against the fake GitHub API from the core tests
// (packages/core/test/fakes/github.ts) served over HTTP. A scratch git repo whose `origin` is octo-org/launchpad,
// a token in GITHUB_TOKEN: onboarding says which account and repo GitHub would use, nothing connects on choice,
// the picker lists the repos with this project's repo first, a repo with issues off is refused without switching,
// and the repo picked instead is saved and shown in Settings → Tracker. No response carries the token.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = 'gho_e2e_never_shown_7f3a';

/** The core test fake, bundled for plain node and served on a free port. */
async function serveFake(top) {
  const out = path.join(top, 'fake-github.mjs');
  await build({
    entryPoints: [path.resolve(here, '../packages/core/test/fakes/github.ts')],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
  });
  const { fakeGitHub } = await import(pathToFileURL(out).href);
  const gh = fakeGitHub({
    repo: 'octo-org/tracker',
    login: 'octo-dev',
    token: TOKEN,
    repos: [{ full_name: 'octo-org/launchpad' }, { full_name: 'octo-org/quiet', has_issues: false }],
  });
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8') || undefined;
    const r = await gh.fetch(`http://fake${req.url}`, { method: req.method, headers: req.headers, body });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function startLookout(cli, cwd, env) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
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

export async function verifyGitHub({ browser, cli, log, shots }) {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-github-e2e-')));
  const repo = path.join(top, 'launchpad');
  fs.mkdirSync(path.join(repo, '.teamtrail'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:octo-org/launchpad.git'], { cwd: repo });
  const fake = await serveFake(top);
  const env = {
    ...process.env,
    TEAMTRAIL_CONFIG_DIR: path.join(top, 'config'),
    TEAMTRAIL_GITHUB_API: fake.url,
    GITHUB_TOKEN: TOKEN,
  };
  delete env.GH_TOKEN;
  const { server, url } = await startLookout(cli, repo, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const api = async (p) => (await fetch(new URL(`__teamtrail${p}`, url))).text();
  try {
    await page.goto(url);
    const dialog = page.locator('.dialog.onboarding');
    const ghChoice = dialog.locator('.choice', { hasText: 'GitHub Issues' });
    await ghChoice.getByText('Will use octo-org/launchpad as octo-dev (GITHUB_TOKEN)').waitFor({ timeout: 15_000 });
    await ghChoice.click();
    const rows = dialog.locator('.repo-row');
    await rows.first().waitFor({ timeout: 15_000 });
    const first = await rows.first().innerText();
    const listed = await rows.count();
    const quietChoice = await api('/trackers');
    if (shots) await page.screenshot({ path: path.join(shots, '20-github-picker.png') });

    // A typed repo with issues off is refused, and nothing switches.
    await dialog.getByLabel('Search repositories').fill('octo-org/quiet');
    await rows.first().locator('.ds-row-main').click();
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByText('Issues are turned off in octo-org/quiet').waitFor({ timeout: 15_000 });
    const afterRefusal = JSON.parse(await api('/trackers')).active;

    // The repo picked instead connects, is saved for this project and shown in Settings.
    await dialog.getByLabel('Search repositories').fill('tracker');
    await rows.filter({ hasText: 'octo-org/tracker' }).locator('.ds-row-main').click();
    await dialog.getByText('Will use octo-org/tracker as octo-dev (GITHUB_TOKEN)').waitFor();
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.waitFor({ state: 'detached', timeout: 20_000 });
    // Settings is a full page: `?settings=tracker` opens its Project group at Tracker.
    await page.goto(`${url}?settings=tracker`);
    await page.locator('.settings-page').waitFor({ timeout: 15_000 });
    const who = page.locator('.connector .c-who');
    await who.waitFor({ timeout: 15_000 });
    const whoText = await who.innerText();
    if (shots) await page.screenshot({ path: path.join(shots, '21-github-settings.png') });
    const saved = JSON.parse(fs.readFileSync(path.join(repo, '.teamtrail', 'trackers.json'), 'utf8'));
    const responses = [quietChoice, await api('/trackers'), await api('/trackers/github/repos')];
    const leaked = responses.some((t) => t.includes(TOKEN));

    const ok =
      first.includes('octo-org/launchpad') &&
      first.includes("This project's repo") &&
      listed === 2 &&
      JSON.parse(quietChoice).active === 'markdown' &&
      afterRefusal === 'markdown' &&
      saved.github?.repo === 'octo-org/tracker' &&
      whoText === 'Connected to octo-org/tracker as octo-dev, using GITHUB_TOKEN' &&
      !leaked &&
      !errors.length;
    log(
      `github picker ${ok ? 'ok' : 'WRONG'}: choosing GitHub left the tracker ${JSON.parse(quietChoice).active}, ${listed} repos listed with "${first.split('\n')[0]}" first, issues-off repo refused (still ${afterRefusal}), saved ${saved.github?.repo}, Settings says "${whoText}", token in responses: ${leaked}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await page.close();
    server.kill('SIGTERM');
    fake.server.close();
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
