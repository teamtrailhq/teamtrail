// Opening the browser signed in, end to end against the built CLI: `teamtrail` and `teamtrail pair` find the http
// browser (stand-ins on PATH for `osascript` on macOS and `xdg-settings` on Linux name one) and hand its launcher
// (stand-in `open` or `gio` that records its argv) only the path of a one-time page in the machine store, never a
// code; the terminal announces the sign-in; Chrome, opened on that page, lands on the Lookout's "Sign in this browser" and
// signs in with one click; the page is gone once used, and every page is gone once the Lookout stops.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookoutLinks } from './e2eHelpers.mjs';

const CODE = /#pair=([A-Za-z0-9_-]{43})/;

/**
 * A folder with a tracker, a config dir and stand-ins: `osascript` and `xdg-settings` name a browser, and `open`,
 * `xdg-open` and `gio` append their argv, tab-separated, to a file.
 */
function scratch(env) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-open-signed-in-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const bin = path.join(top, 'bin');
  const record = path.join(top, 'opened.txt');
  fs.mkdirSync(bin);
  for (const name of ['open', 'xdg-open', 'gio']) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nprintf '%s\\t' "$@" >> '${record}'\necho >> '${record}'\n`, {
      mode: 0o755,
    });
  }
  fs.writeFileSync(path.join(bin, 'osascript'), '#!/bin/sh\necho com.example.browser\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'xdg-settings'), '#!/bin/sh\necho teamtrail-test.desktop\n', { mode: 0o755 });
  const data = path.join(top, 'data');
  fs.mkdirSync(path.join(data, 'applications'), { recursive: true });
  fs.writeFileSync(path.join(data, 'applications', 'teamtrail-test.desktop'), '[Desktop Entry]\nExec=browser %u\n');
  const config = path.join(top, 'config');
  const runEnv = {
    ...env,
    TEAMTRAIL_CONFIG_DIR: config,
    XDG_DATA_HOME: data,
    PATH: `${bin}${path.delimiter}${env.PATH ?? ''}`,
  };
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
  const file = argv.split('\t').find((a) => a.endsWith('.html'));
  const url = file ? pathToFileURL(file).href : undefined;
  const html = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const target = /location\.replace\("([^"]+)"\)/.exec(html)?.[1];
  const code = target ? CODE.exec(target)?.[1] : undefined;
  const mode = file && fs.existsSync(file) ? (fs.statSync(file).mode & 0o777).toString(8) : 'missing';
  const clean = !!code && !argv.includes(code) && !argv.includes('#pair');
  return { url, file, target, code, mode, clean };
}

/**
 * Chrome on the page: it reaches the Lookout's "Sign in this browser", and a click signs it in. Returns what
 * Settings → Browsers & devices then lists too.
 */
async function signInFrom(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'Sign in this browser' }).waitFor({ timeout: 15_000 });
    const landed = page.url();
    await page.getByRole('button', { name: 'Sign in this browser' }).click();
    await page.locator('.dialog.onboarding').waitFor({ timeout: 15_000 });
    const signedIn = await page.evaluate(() => !!localStorage.getItem('teamtrail.session'));
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.goto(`${landed}?settings=devices`);
    await page.locator('#settings-devices .ra-row').first().waitFor({ timeout: 15_000 });
    const devices = await page.locator('#settings-devices').innerText();
    return { landed, signedIn, devices };
  } finally {
    await page.close();
  }
}

/**
 * Another program read the page's code first and paired with it (faking the Lookout's Origin, as curl can): the
 * human's own click then hears the link was used, and that someone else may have.
 */
async function stolenFirst(browser, opening) {
  const origin = new URL(opening.target).origin;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    // the browser has the page open, as the human does, when the other program gets there first
    await page.goto(opening.url);
    await page.getByRole('button', { name: 'Sign in this browser' }).waitFor({ timeout: 15_000 });
    const thief = await fetch(`${origin}/__teamtrail/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/130',
      },
      body: JSON.stringify({ code: opening.code }),
    });
    await page.getByRole('button', { name: 'Sign in this browser' }).click();
    const hint = page.getByText("If you didn't sign in just now, someone else may have");
    await hint.waitFor({ timeout: 15_000 });
    return { thief: thief.status, told: await hint.isVisible() };
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
  let out = '';
  try {
    const printed = await new Promise((resolve, reject) => {
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

    execFileSync(process.execPath, [cli, 'pair'], { cwd: s.top, env: s.env });
    const [, , byPairAgain] = await opened(s.record, 3);
    const stolen = await stolenFirst(browser, inspect(byPairAgain ?? ''));

    // One more page waits; the Lookout stopping removes it.
    execFileSync(process.execPath, [cli, 'pair'], { cwd: s.top, env: s.env });
    await opened(s.record, 4);
    const waiting = pagesLeft(s.config).length;
    await new Promise((r) => (server.once('exit', r), server.kill('SIGTERM')));
    const leftAfterStop = pagesLeft(s.config).length;

    const landedOnLookout = [first, second].every((x) => x.landed === printed.url && x.signedIn);
    const notices = [
      ...out.matchAll(
        /Signed in a browser \(opened page\) at [^:]+:\d\d:\d\d[^:]*: .+ · (si_[0-9a-f]{6})\. Not you\? Revoke it in Settings → Browsers & devices\./g,
      ),
    ];
    const announced = notices.length;
    // the first sign-in's short id, as the terminal named it, beside its entry in Settings
    const listed = !!notices[0] && first.devices.includes(notices[0][1]);
    const ok =
      startClean &&
      pair.clean &&
      start.mode === '600' &&
      landedOnLookout &&
      firstGone &&
      waiting === 1 &&
      !leftAfterStop &&
      announced === 3 &&
      listed &&
      stolen.thief === 200 &&
      stolen.told;
    const said =
      `the browser's launcher got ${start.url ? 'only a page path' : 'NO PAGE'} (${start.mode}, ${startClean ? 'no code in argv' : 'A CODE IN ARGV'}), ` +
      `\`teamtrail pair\` too (${pair.clean ? 'no code in argv' : 'A CODE IN ARGV'}); Chrome went from file:// to ${first.landed} and ` +
      `signed in with one click (${landedOnLookout ? 'both' : 'NOT BOTH'}); the used page ${firstGone ? 'was removed' : 'STAYED'}, ` +
      `${leftAfterStop ? `${leftAfterStop} PAGES LEFT` : 'none left'} after the Lookout stopped; ` +
      `the terminal announced ${announced} of 3 sign-ins through an opened page, with a short id ${listed ? 'Settings shows too' : 'SETTINGS DOES NOT SHOW'}; ` +
      `a code taken first (${stolen.thief}) left the human's click saying ${stolen.told ? 'someone else may have used it' : 'NOTHING OF IT'}`;
    return { ok, said, target: start.target?.split('#')[0] ?? 'nothing opened' };
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(s.top, { recursive: true, force: true });
  }
}
