// Opening the browser signed in, end to end against the built CLI: `teamtrail` and `teamtrail pair` hand the
// platform's opener (a stand-in on PATH that records its argv) only the file:// path of a one-time page in the
// machine store, never a code; Chrome, opened on that page, lands on the Lookout's "Sign in this browser" and
// signs in with one click; the page is gone once used, and every page is gone once the Lookout stops.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookoutLinks } from './e2eHelpers.mjs';

const CODE = /#pair=([A-Za-z0-9_-]{43})/;

/** A folder with a tracker, a config dir and stand-ins for `open` and `xdg-open` that append their argv to a file. */
function scratch(env) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-open-signed-in-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const bin = path.join(top, 'bin');
  const record = path.join(top, 'opened.txt');
  fs.mkdirSync(bin);
  for (const name of ['open', 'xdg-open']) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "$@" >> '${record}'\n`, { mode: 0o755 });
  }
  const config = path.join(top, 'config');
  const runEnv = { ...env, TEAMTRAIL_CONFIG_DIR: config, PATH: `${bin}${path.delimiter}${env.PATH ?? ''}` };
  return { top, record, config, env: runEnv };
}

/** The argv lines the stand-in opener recorded, once there are `count` of them. */
async function opened(record, count) {
  const until = Date.now() + 15_000;
  const lines = () => (fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim().split('\n') : []);
  while (lines().length < count && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  return lines();
}

/** What one opening looks like: the argv, the page it names, the link that page sends the browser to. */
function inspect(argv) {
  const url = argv.split(' ').find((a) => a.startsWith('file://'));
  const file = url ? fileURLToPath(url) : undefined;
  const html = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const target = /location\.replace\("([^"]+)"\)/.exec(html)?.[1];
  const code = target ? CODE.exec(target)?.[1] : undefined;
  const mode = file && fs.existsSync(file) ? (fs.statSync(file).mode & 0o777).toString(8) : 'missing';
  const clean = !!code && !argv.includes(code) && !argv.includes('#pair');
  return { url, file, target, code, mode, clean };
}

/** Chrome on the page: it reaches the Lookout's "Sign in this browser", and a click signs it in. */
async function signInFrom(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'Sign in this browser' }).waitFor({ timeout: 15_000 });
    const landed = page.url();
    await page.getByRole('button', { name: 'Sign in this browser' }).click();
    await page.locator('.dialog.onboarding').waitFor({ timeout: 15_000 });
    const signedIn = await page.evaluate(() => !!localStorage.getItem('teamtrail.session'));
    return { landed, signedIn };
  } finally {
    await page.close();
  }
}

const pagesLeft = (config) =>
  fs.existsSync(path.join(config, 'projects'))
    ? fs
        .readdirSync(path.join(config, 'projects'), { recursive: true })
        .filter((f) => /sign-in-[0-9a-f]{48}\.html/.test(String(f)))
    : [];

async function waitGone(file) {
  const until = Date.now() + 10_000;
  while (fs.existsSync(file) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  return !fs.existsSync(file);
}

/** Returns `target`, the address the browser was sent to, for the loopback check. */
export async function verifyOpenSignedIn({ browser, cli, env }) {
  const s = scratch(env);
  const server = spawn(process.execPath, [cli, '--port', '0'], { cwd: s.top, env: s.env });
  try {
    const printed = await new Promise((resolve, reject) => {
      let out = '';
      server.stdout.on('data', (c) => {
        out += c;
        const found = lookoutLinks(out);
        if (found) resolve(found);
      });
      server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
    });
    const [atStart] = await opened(s.record, 1);
    const start = inspect(atStart ?? '');
    const printedCode = CODE.exec(printed.pair)?.[1];
    const startClean = start.clean && !!printedCode && !atStart.includes(printedCode) && start.code !== printedCode;
    const first = await signInFrom(browser, start.url);
    const firstGone = await waitGone(start.file);

    execFileSync(process.execPath, [cli, 'pair'], { cwd: s.top, env: s.env });
    const [, byPair] = await opened(s.record, 2);
    const pair = inspect(byPair ?? '');
    const second = await signInFrom(browser, pair.url);

    // One more page waits; the Lookout stopping removes it.
    execFileSync(process.execPath, [cli, 'pair'], { cwd: s.top, env: s.env });
    await opened(s.record, 3);
    const waiting = pagesLeft(s.config).length;
    await new Promise((r) => (server.once('exit', r), server.kill('SIGTERM')));
    const leftAfterStop = pagesLeft(s.config).length;

    const landedOnLookout = [first, second].every((x) => x.landed === printed.url && x.signedIn);
    const ok =
      startClean &&
      pair.clean &&
      start.mode === '600' &&
      landedOnLookout &&
      firstGone &&
      waiting === 1 &&
      !leftAfterStop;
    const said =
      `the opener got ${start.url ? 'only a file:// page' : 'NO PAGE'} (${start.mode}, ${startClean ? 'no code in argv' : 'A CODE IN ARGV'}), ` +
      `\`teamtrail pair\` too (${pair.clean ? 'no code in argv' : 'A CODE IN ARGV'}); Chrome went from file:// to ${first.landed} and ` +
      `signed in with one click (${landedOnLookout ? 'both' : 'NOT BOTH'}); the used page ${firstGone ? 'was removed' : 'STAYED'}, ` +
      `${leftAfterStop ? `${leftAfterStop} PAGES LEFT` : 'none left'} after the Lookout stopped`;
    return { ok, said, target: start.target?.split('#')[0] ?? 'nothing opened' };
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(s.top, { recursive: true, force: true });
  }
}
