import type * as childProcess from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpHandler } from '../src/serve/browser/types';
import { openSignedIn } from '../src/serve/openSignedIn';

/*
 * The browser opens on a sign-in link without the link on any command line: what is spawned is recorded here, and
 * must never carry the code. The page goes to the http browser by name, never to the `.html` default.
 */
const spawned = vi.hoisted(() => [] as string[][]);
vi.mock('node:child_process', async (actual) => {
  const real = await actual<typeof childProcess>();
  return {
    ...real,
    spawn: (cmd: string, args: string[]) => {
      spawned.push([cmd, ...args]);
      return { on: () => undefined, unref: () => undefined };
    },
  };
});

const CODE = 'Q'.repeat(20) + 'abc_-' + '7'.repeat(18);
const LINK = `http://127.0.0.1:7420/?settings=slack#pair=${CODE}`;
const BROWSER: HttpHandler = { kind: 'app', name: 'com.example.browser', command: (f) => ['open', ['-b', 'x', f]] };
const NO_BROWSER: HttpHandler = { kind: 'none', why: 'no default browser is set for http' };

let top: string;
let root: string;
let out: string[];
let minted: number;
const mint = () => (minted++, LINK);

beforeEach(() => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-open-signed-in-'));
  root = path.join(top, 'repo', '.teamtrail');
  mkdirSync(root, { recursive: true });
  spawned.length = 0;
  out = [];
  minted = 0;
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
});

afterEach(() => vi.restoreAllMocks());

/** A config dir inside a folder nobody may write. */
function lockedConfig(run: (configDir: string) => void) {
  const locked = path.join(top, 'locked');
  mkdirSync(locked);
  chmodSync(locked, 0o500);
  try {
    run(path.join(locked, 'config'));
  } finally {
    chmodSync(locked, 0o700);
  }
}

describe('openSignedIn', () => {
  it('opens a private one-time page in the machine store with the http browser, never the code', () => {
    const configDir = path.join(top, 'config');
    const opened = openSignedIn({ root, configDir, mint, fallback: 'http://127.0.0.1:7420/', handler: () => BROWSER });

    expect(spawned).toHaveLength(1);
    const argv = spawned[0];
    expect(argv.join(' ')).not.toContain(CODE);
    expect(argv.join(' ')).not.toContain('#pair');
    expect(argv.slice(0, 3)).toEqual(['open', '-b', 'x']);

    const file = argv[3];
    expect(opened).toEqual({ kind: 'sign-in-page', file, browser: 'com.example.browser' });
    // <config dir>/projects/<project id>/, the machine store, where pairing codes are minted
    expect(path.dirname(path.dirname(file))).toBe(path.join(configDir, 'projects'));
    expect(path.basename(path.dirname(file))).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(path.basename(file)).toMatch(/^sign-in-[0-9a-f]{48}\.html$/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain(`location.replace("${LINK}")`);
  });

  it('opens the bare Lookout, mints nothing and writes no page when there is no http browser', () => {
    const configDir = path.join(top, 'config');
    const fallback = 'http://127.0.0.1:7420/?settings=slack';
    const opened = openSignedIn({ root, configDir, mint, fallback, handler: () => NO_BROWSER });
    expect(opened).toEqual({ kind: 'bare', why: NO_BROWSER.why });
    expect(minted).toBe(0);
    expect(existsSync(configDir)).toBe(false);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toContain(fallback);
    expect(spawned[0].join(' ')).not.toMatch(/\.html/);
    expect(out.join('')).toContain('no default browser is set for http');
  });

  it('opens the bare Lookout and says why when the store can’t be written', () => {
    lockedConfig((configDir) => {
      const fallback = 'http://127.0.0.1:7420/?settings=slack';
      const opened = openSignedIn({ root, configDir, mint, fallback, handler: () => BROWSER });
      expect(opened.kind).toBe('bare');
      expect(spawned).toHaveLength(1);
      expect(spawned[0].join(' ')).not.toContain(CODE);
      expect(spawned[0]).toContain(fallback);
      expect(out.join('')).toMatch(/couldn't open a sign-in page \(.*can't read its config folder/);
      expect(existsSync(configDir)).toBe(false);
    });
  });

  it('falls back to the bare Lookout when minting the code fails, instead of stopping the Lookout', () => {
    const fallback = 'http://127.0.0.1:7420/';
    const failing = () => {
      throw new Error('sign-in.json is locked');
    };
    const opened = openSignedIn({ root, mint: failing, fallback, handler: () => BROWSER });
    expect(opened).toEqual({ kind: 'bare', why: 'sign-in.json is locked' });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toContain(fallback);
  });

  it('opens nothing without a fallback (`teamtrail pair`) when the store can’t be written', () => {
    lockedConfig((configDir) => {
      const opened = openSignedIn({ root, configDir, mint, handler: () => BROWSER });
      expect(opened.kind).toBe('bare');
      expect(spawned).toEqual([]);
      expect(out.join('')).toContain('no browser was opened');
    });
  });
});
