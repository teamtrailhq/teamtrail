// GitHub Issues steps of the end-to-end check (verify-mcp.mjs), against the fake GitHub API from the core tests
// (packages/core/test/fakes/github.ts, and github.com's device flow from fakes/githubDevice.ts) served over HTTP.
// 1. A scratch git repo whose `origin` is octo-org/launchpad, a token in GITHUB_TOKEN: onboarding says which account
//    and repo GitHub would use, nothing connects on choice, the picker shows skeleton rows while the repo list is held
//    back (Connect disabled), then lists the repos with this project's repo first, a repo with issues off is refused
//    without switching, and the repo picked instead is saved and shown in Settings → Tracker.
// 2. No token at all (no env, a gh that isn't logged in): Sign in with GitHub shows a code, the fake approves it, the
//    picker takes over as the signed-in login, Connect saves the repo, Settings says "using your GitHub sign-in", and
//    Sign out forgets the 0600 token file entry. No response carries a token.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { responseGate, shootThemes } from './e2eHelpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = 'gho_e2e_never_shown_7f3a';
const CLIENT_ID = 'Iv1.e2e_fake_client';

/** The core test fakes, bundled for plain node and served on a free port; `gate` holds responses on purpose. */
async function serveFake(top) {
  const fakes = path.resolve(here, '../packages/core/test/fakes');
  await build({
    entryPoints: [path.join(fakes, 'github.ts'), path.join(fakes, 'githubDevice.ts')],
    outdir: path.join(top, 'fakes'),
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
  });
  const { fakeGitHub } = await import(pathToFileURL(path.join(top, 'fakes', 'github.mjs')).href);
  const { fakeGitHubDevice } = await import(pathToFileURL(path.join(top, 'fakes', 'githubDevice.mjs')).href);
  const gh = fakeGitHub({
    repo: 'octo-org/tracker',
    login: 'octo-dev',
    token: TOKEN,
    repos: [{ full_name: 'octo-org/launchpad' }, { full_name: 'octo-org/quiet', has_issues: false }],
  });
  const device = fakeGitHubDevice({ clientId: CLIENT_ID, token: TOKEN, interval: 1 });
  const gate = responseGate();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8') || undefined;
    await gate.pass(req.url);
    // The device fake answers with its own address (`verification_uri`), so it sees the real host.
    const onDevice = device.handles(new URL(req.url, 'http://fake').pathname);
    const fake = onDevice ? device : gh;
    const host = onDevice ? req.headers.host : 'fake';
    const r = await fake.fetch(`http://${host}${req.url}`, { method: req.method, headers: req.headers, body });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, device, gate, url: `http://127.0.0.1:${server.address().port}` };
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

function scratchRepo(top, name) {
  const repo = path.join(top, name);
  fs.mkdirSync(path.join(repo, '.teamtrail'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:octo-org/launchpad.git'], { cwd: repo });
  return repo;
}

/** Part 1: a token in GITHUB_TOKEN, the picker with a held repo list, refusal and connect. */
async function pickerSteps({ browser, cli, shots, top, fake }) {
  const repo = scratchRepo(top, 'launchpad');
  const env = {
    ...process.env,
    TEAMTRAIL_CONFIG_DIR: path.join(top, 'config'),
    TEAMTRAIL_GITHUB_API: fake.url,
    TEAMTRAIL_GITHUB_WEB: fake.url,
    TEAMTRAIL_GITHUB_CLIENT_ID: CLIENT_ID,
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
    // The repo list is held back: skeleton rows and a quiet line, Connect disabled, then the list arrives.
    const release = fake.gate.hold('/user/repos');
    await ghChoice.click();
    const loading = dialog.locator('.picker-loading', { hasText: 'Loading your repos…' });
    await loading.waitFor({ timeout: 15_000 });
    const skeletons = await loading.locator('.ds-skeleton-row').count();
    const connect = dialog.getByRole('button', { name: 'Connect', exact: true });
    const disabledWhileLoading = await connect.isDisabled();
    await shootThemes(page, shots, '24-github-loading');
    release();
    const rows = dialog.locator('.repo-row');
    await rows.first().waitFor({ timeout: 15_000 });
    await loading.waitFor({ state: 'detached' });
    const loadingOk = skeletons === 3 && disabledWhileLoading;
    const first = await rows.first().innerText();
    const listed = await rows.count();
    const quietChoice = await api('/trackers');
    if (shots) await page.screenshot({ path: path.join(shots, '20-github-picker.png') });

    // A typed repo with issues off is refused, and nothing switches.
    await dialog.getByLabel('Search repositories').fill('octo-org/quiet');
    await rows.first().locator('.ds-row-main').click();
    await connect.click();
    await dialog.getByText('Issues are turned off in octo-org/quiet').waitFor({ timeout: 15_000 });
    const afterRefusal = JSON.parse(await api('/trackers')).active;

    // The repo picked instead connects, is saved for this project and shown in Settings.
    await dialog.getByLabel('Search repositories').fill('tracker');
    await rows.filter({ hasText: 'octo-org/tracker' }).locator('.ds-row-main').click();
    await dialog.getByText('Will use octo-org/tracker as octo-dev (GITHUB_TOKEN)').waitFor();
    await connect.click();
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
      loadingOk &&
      first.includes('octo-org/launchpad') &&
      first.includes("This project's repo") &&
      listed === 2 &&
      JSON.parse(quietChoice).active === 'markdown' &&
      afterRefusal === 'markdown' &&
      saved.github?.repo === 'octo-org/tracker' &&
      whoText === 'Connected to octo-org/tracker as octo-dev, using GITHUB_TOKEN' &&
      !leaked &&
      !errors.length;
    const said = `github picker ${ok ? 'ok' : 'WRONG'}: loading showed ${skeletons} skeleton rows with Connect disabled (${disabledWhileLoading}) and resolved, choosing GitHub left the tracker ${JSON.parse(quietChoice).active}, ${listed} repos listed with "${first.split('\n')[0]}" first, issues-off repo refused (still ${afterRefusal}), saved ${saved.github?.repo}, Settings says "${whoText}", token in responses: ${leaked}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`;
    return { ok, said };
  } finally {
    await page.close();
    server.kill('SIGTERM');
  }
}

/** A `gh` on PATH that isn't logged in, so the person's own gh login never reaches the fake. */
function loggedOutGh(top) {
  const bin = path.join(top, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "not logged in" >&2\nexit 1\n', { mode: 0o755 });
  return bin;
}

/** Part 2: no token anywhere; Sign in with GitHub, connect, Settings, Sign out. */
async function signInSteps({ browser, cli, shots, top, fake }) {
  const repo = scratchRepo(top, 'signin');
  const config = path.join(top, 'config-signin');
  const env = {
    ...process.env,
    PATH: `${loggedOutGh(top)}${path.delimiter}${process.env.PATH}`,
    TEAMTRAIL_CONFIG_DIR: config,
    TEAMTRAIL_GITHUB_API: fake.url,
    TEAMTRAIL_GITHUB_WEB: fake.url,
    TEAMTRAIL_GITHUB_CLIENT_ID: CLIENT_ID,
  };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  const { server, url } = await startLookout(cli, repo, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const api = async (p) => (await fetch(new URL(`__teamtrail${p}`, url))).text();
  const credFile = path.join(config, 'credentials.json');
  try {
    await page.goto(url);
    const dialog = page.locator('.dialog.onboarding');
    await dialog.locator('.choice', { hasText: 'GitHub Issues' }).click();
    await dialog.getByRole('button', { name: 'Sign in with GitHub' }).click();
    const code = dialog.locator('.gh-device-code');
    await code.waitFor({ timeout: 15_000 });
    const codeText = await code.innerText();
    const href = await dialog.getByRole('link', { name: 'Open GitHub' }).getAttribute('href');
    await dialog.getByText('Waiting for you to approve on GitHub…').waitFor();
    await shootThemes(page, shots, '25-github-sign-in-code');

    // The person approves the code on GitHub; the page notices on its next poll.
    fake.device.approve();
    await dialog
      .getByText('Will use octo-org/launchpad as octo-dev (your GitHub sign-in)')
      .waitFor({ timeout: 15_000 });
    await dialog.locator('.repo-row').first().waitFor({ timeout: 15_000 });
    await shootThemes(page, shots, '26-github-signed-in');
    const stored = JSON.parse(fs.readFileSync(credFile, 'utf8'));
    const mode = fs.statSync(credFile).mode & 0o777;
    const insideRepo = fs.readdirSync(path.join(repo, '.teamtrail')).some((f) => f.includes('credential'));

    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.waitFor({ state: 'detached', timeout: 20_000 });
    await page.goto(`${url}?settings=tracker`);
    const who = page.locator('.connector .c-who');
    await who.waitFor({ timeout: 15_000 });
    const whoText = await who.innerText();
    const responses = [await api('/trackers'), await api('/trackers/github/repos')];

    // Sign out from Settings → Tracker → Edit: the token is forgotten and Sign in shows again.
    await page.locator('.connector', { hasText: 'GitHub Issues' }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Sign in with GitHub' }).waitFor({ timeout: 15_000 });
    const afterOut = JSON.parse(fs.readFileSync(credFile, 'utf8'));
    responses.push(await api('/trackers'));
    const leaked = responses.some((t) => t.includes(TOKEN));

    const ok =
      codeText === fake.device.userCode &&
      href === `${fake.url}/login/device` &&
      stored.githubSignIn?.token === TOKEN &&
      mode === 0o600 &&
      !insideRepo &&
      whoText === 'Connected to octo-org/launchpad as octo-dev, using your GitHub sign-in' &&
      !afterOut.githubSignIn &&
      fake.device.issued() === 1 &&
      !leaked &&
      !errors.length;
    const said = `github sign-in ${ok ? 'ok' : 'WRONG'}: code ${codeText} at ${href}, token saved mode ${mode.toString(8)} outside the repo (${!insideRepo}), Settings says "${whoText}", signed out (${!afterOut.githubSignIn}), token in responses: ${leaked}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`;
    return { ok, said };
  } finally {
    await page.close();
    server.kill('SIGTERM');
  }
}

export async function verifyGitHub({ browser, cli, log, shots }) {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-github-e2e-')));
  const fake = await serveFake(top);
  try {
    const picker = await pickerSteps({ browser, cli, shots, top, fake });
    log(picker.said);
    const signIn = await signInSteps({ browser, cli, shots, top, fake });
    log(signIn.said);
    return picker.ok && signIn.ok;
  } finally {
    fake.server.close();
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
