import type * as childProcess from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSignedIn } from '../src/serve/openSignedIn';

/*
 * The browser opens on a sign-in link without the link on any command line: what the opener is spawned with is
 * recorded here, from the real openBrowser, and must never carry the code.
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

let top: string;
let root: string;
let out: string[];

beforeEach(() => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-open-signed-in-'));
  root = path.join(top, 'repo', '.teamtrail');
  mkdirSync(root, { recursive: true });
  spawned.length = 0;
  out = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
});

afterEach(() => vi.restoreAllMocks());

describe('openSignedIn', () => {
  it('opens a private one-time page in the machine store, never the code', () => {
    const configDir = path.join(top, 'config');
    const opened = openSignedIn({ root, configDir, link: LINK, fallback: 'http://127.0.0.1:7420/' });

    expect(spawned).toHaveLength(1);
    const argv = spawned[0];
    expect(argv.join(' ')).not.toContain(CODE);
    expect(argv.join(' ')).not.toContain('#pair');
    const url = argv.find((a) => a.startsWith('file://'));
    expect(url).toBeDefined();

    const file = fileURLToPath(url!);
    expect(opened).toEqual({ kind: 'sign-in-page', file });
    // <config dir>/projects/<project id>/, the machine store, where pairing codes are minted
    expect(path.dirname(path.dirname(file))).toBe(path.join(configDir, 'projects'));
    expect(path.basename(path.dirname(file))).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(path.basename(file)).toMatch(/^sign-in-[0-9a-f]{48}\.html$/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain(`location.replace("${LINK}")`);
  });

  it('opens the bare Lookout and says why when the store can’t be written', () => {
    const locked = path.join(top, 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      const configDir = path.join(locked, 'config');
      const opened = openSignedIn({ root, configDir, link: LINK, fallback: 'http://127.0.0.1:7420/?settings=slack' });
      expect(opened.kind).toBe('bare');
      expect(spawned).toHaveLength(1);
      expect(spawned[0].join(' ')).not.toContain(CODE);
      expect(spawned[0]).toContain('http://127.0.0.1:7420/?settings=slack');
      expect(out.join('')).toMatch(/couldn't write its sign-in page \(.*can't read its config folder/);
      expect(existsSync(configDir)).toBe(false);
    } finally {
      chmodSync(locked, 0o700);
    }
  });

  it('opens nothing without a fallback (`teamtrail pair`) when the store can’t be written', () => {
    const locked = path.join(top, 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      const opened = openSignedIn({ root, configDir: path.join(locked, 'config'), link: LINK });
      expect(opened.kind).toBe('bare');
      expect(spawned).toEqual([]);
      expect(out.join('')).toContain('no browser was opened');
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});
