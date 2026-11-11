import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { machineStore } from '../src/machine/machineStore';
import { createLookoutSignIn } from '../src/signIn/lookoutSignIn';
import { LINK_CODE_MS, mintPairCode } from '../src/signIn/pairCodes';
import { signInRedirectPage } from '../src/signIn/signInRedirectPage';
import { sweepSignInRedirects } from '../src/signIn/sweepSignInRedirects';
import { writeSignInRedirect } from '../src/signIn/writeSignInRedirect';

/*
 * The one-time page the browser is opened on instead of the sign-in link, so the code never goes on a command line:
 * private, random, in the machine store, and gone once the code is used, expires, or the Lookout stops.
 */
let top: string;
let configDir: string;
let n = 0;

before(() => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-sign-in-redirect-'));
  configDir = path.join(top, 'config');
});

/** A tracker folder of its own for each test, so each has its own store. */
function place() {
  const root = path.join(top, `repo-${++n}`, '.teamtrail');
  mkdirSync(root, { recursive: true });
  return { root, configDir };
}

const link = (code: string) => `http://127.0.0.1:7420/?settings=slack#pair=${code}`;
const pages = (root: string) => {
  const dir = machineStore(root, configDir).dir;
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('sign-in-') && f.endsWith('.html')) : [];
};
const request = { headers: {}, socket: {} } as unknown as IncomingMessage;

test('the page is 0600, randomly named, in this project’s machine store, and sends the browser on to the link', () => {
  const at = place();
  const first = writeSignInRedirect({ ...at, link: link('a'.repeat(43)) });
  const second = writeSignInRedirect({ ...at, link: link('b'.repeat(43)) });
  const store = machineStore(at.root, configDir);
  assert.equal(path.dirname(first), store.dir);
  assert.match(path.basename(first), /^sign-in-[0-9a-f]{48}\.html$/);
  assert.notEqual(first, second);
  assert.equal(statSync(first).mode & 0o777, 0o600);
  assert.equal(statSync(store.dir).mode & 0o777, 0o700);
  // only the pages themselves: no temp file left behind
  assert.deepEqual(readdirSync(store.dir).sort(), [path.basename(first), path.basename(second)].sort());

  const html = readFileSync(first, 'utf8');
  assert.ok(html.includes(`location.replace("${link('a'.repeat(43))}")`));
  assert.ok(html.includes(`<meta http-equiv="refresh" content="0;url=${link('a'.repeat(43))}">`));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(html.includes("default-src 'none'"));
  assert.doesNotMatch(html, /\ssrc=|<link|https?:\/\/(?!127\.0\.0\.1:7420\/)/);
});

test('the page cannot be broken out of by what the link holds', () => {
  const html = signInRedirectPage('http://127.0.0.1:1/"></script><script>alert(1)</script>#pair=x');
  assert.equal(html.match(/<script>/g)?.length, 1);
  assert.doesNotMatch(html, /"><\/script>/);
});

test('a page stays while its code waits, and goes once the code is used', () => {
  const at = place();
  const signIn = createLookoutSignIn({ ...at, sweepMs: 60_000 });
  const waiting = signIn.mintCode('machine').code;
  const used = signIn.mintCode('machine').code;
  writeSignInRedirect({ ...at, link: link(waiting) });
  const usedPage = writeSignInRedirect({ ...at, link: link(used) });
  assert.equal(pages(at.root).length, 2);

  assert.equal(signIn.pair(request, { code: used, local: true, who: 'loopback' }).kind, 'paired');
  assert.equal(existsSync(usedPage), false, 'the used code’s page is removed at once');
  assert.equal(pages(at.root).length, 1, 'the other one waits');

  signIn.close();
  assert.deepEqual(pages(at.root), [], 'the Lookout stopping removes the rest');
});

test('a page goes when its code expires', () => {
  const at = place();
  const { code } = mintPairCode({ ...at, kind: 'machine', instance: process.pid });
  writeSignInRedirect({ ...at, link: link(code) });
  sweepSignInRedirects({ ...at, keep: 'pending' });
  assert.equal(pages(at.root).length, 1);
  sweepSignInRedirects({ ...at, keep: 'pending', now: Date.now() + LINK_CODE_MS + 1 });
  assert.deepEqual(pages(at.root), []);
});

test('a page without a waiting code, and a stale temp file, are swept', () => {
  const at = place();
  writeSignInRedirect({ ...at, link: link('c'.repeat(43)) });
  const store = machineStore(at.root, configDir);
  const tmp = store.file(`sign-in-${'0'.repeat(48)}.html.4242.tmp`);
  writeFileSync(tmp, 'half');
  const old = new Date(Date.now() - 120_000);
  utimesSync(tmp, old, old);
  const unrelated = store.file('sign-in.json');
  writeFileSync(unrelated, '{"v":1,"sessions":[],"codes":[]}');
  sweepSignInRedirects({ ...at, keep: 'pending' });
  assert.deepEqual(readdirSync(store.dir), ['sign-in.json']);
});

test('a Lookout starting sweeps the pages a crashed one left', () => {
  const at = place();
  const { code } = mintPairCode({ ...at, kind: 'machine', instance: 999_999 });
  writeSignInRedirect({ ...at, link: link(code) });
  assert.equal(pages(at.root).length, 1);
  const signIn = createLookoutSignIn({ ...at, sweepMs: 60_000 });
  assert.deepEqual(pages(at.root), []);
  signIn.close();
});

test('a store that can’t be written throws, saying why', { skip: process.getuid?.() === 0 }, () => {
  const locked = path.join(top, 'locked');
  mkdirSync(locked);
  chmodSync(locked, 0o500);
  try {
    const at = { root: place().root, configDir: path.join(locked, 'config') };
    assert.throws(() => writeSignInRedirect({ ...at, link: link('d'.repeat(43)) }), /can't read its config folder/);
  } finally {
    chmodSync(locked, 0o700);
  }
});
