import { describe, expect, it } from 'vitest';
import { httpHandler } from '../src/serve/browser/httpHandler';
import type { HandlerDeps } from '../src/serve/browser/types';

/*
 * The one-time sign-in page goes to the program that opens http links, found by name on each platform, never to
 * the `.html` default; a snap or Flatpak browser, or none found, means no page at all.
 */
const FILE = '/home/me/.config/teamtrail/projects/abc/sign-in-0123.html';

function deps(o: { answers?: Record<string, string>; files?: Record<string, string>; env?: NodeJS.ProcessEnv }) {
  const calls: string[][] = [];
  const d: HandlerDeps = {
    run: (cmd, args) => {
      calls.push([cmd, ...args]);
      const key = Object.keys(o.answers ?? {}).find((k) => [cmd, ...args].join(' ').startsWith(k));
      if (key === undefined) throw new Error(`${cmd}: not found`);
      return o.answers![key];
    },
    env: o.env ?? {},
    readFile: (f) => o.files?.[f],
    home: '/home/me',
  };
  return { d, calls };
}

const argvFor = (platform: NodeJS.Platform, d: HandlerDeps) => {
  const h = httpHandler(platform, d);
  return h.kind === 'app' ? h.command(FILE) : h.why;
};

describe('httpHandler', () => {
  it('macOS: opens the file with the http handler’s bundle id', () => {
    const { d, calls } = deps({ answers: { osascript: 'com.google.Chrome\n' } });
    expect(argvFor('darwin', d)).toEqual(['open', ['-b', 'com.google.Chrome', FILE]]);
    expect(calls[0].slice(0, 3)).toEqual(['osascript', '-l', 'JavaScript']);
  });

  it('macOS: none when LaunchServices names nothing usable', () => {
    expect(argvFor('darwin', deps({ answers: { osascript: '\n' } }).d)).toMatch(/no default browser/);
    expect(argvFor('darwin', deps({ answers: { osascript: 'x -a Evil' } }).d)).toMatch(/no default browser/);
    expect(argvFor('darwin', deps({}).d)).toMatch(/couldn't ask macOS/);
  });

  it('Linux: launches the default browser’s desktop entry on the file', () => {
    const entry = '/usr/share/applications/firefox.desktop';
    const { d } = deps({
      answers: { 'xdg-settings get default-web-browser': 'firefox.desktop\n' },
      files: { [entry]: '[Desktop Entry]\nExec=firefox %u\n' },
    });
    expect(argvFor('linux', d)).toEqual(['gio', ['launch', entry, FILE]]);
  });

  it('Linux: the user’s own entry first, from XDG_DATA_HOME', () => {
    const own = '/data/applications/chromium.desktop';
    const { d } = deps({
      answers: { 'xdg-settings': 'chromium.desktop' },
      files: { [own]: 'Exec=chromium %U', '/usr/share/applications/chromium.desktop': 'Exec=chromium' },
      env: { XDG_DATA_HOME: '/data' },
    });
    expect(argvFor('linux', d)).toEqual(['gio', ['launch', own, FILE]]);
  });

  it('Linux: a snap or Flatpak browser gets no page', () => {
    const snap = deps({
      answers: { 'xdg-settings': 'firefox_firefox.desktop' },
      files: { '/var/lib/snapd/desktop/applications/firefox_firefox.desktop': 'Exec=/snap/bin/firefox %u' },
      env: { XDG_DATA_DIRS: '/var/lib/snapd/desktop:/usr/share' },
    });
    expect(argvFor('linux', snap.d)).toMatch(/snap or Flatpak/);
    const flatpak = deps({
      answers: { 'xdg-settings': 'org.mozilla.firefox.desktop' },
      files: { '/usr/share/applications/org.mozilla.firefox.desktop': 'Exec=/usr/bin/flatpak run org.mozilla.firefox' },
    });
    expect(argvFor('linux', flatpak.d)).toMatch(/snap or Flatpak/);
  });

  it('Linux: none without xdg-settings, a default, or its desktop entry', () => {
    expect(argvFor('linux', deps({}).d)).toMatch(/couldn't ask xdg-settings/);
    expect(argvFor('linux', deps({ answers: { 'xdg-settings': '' } }).d)).toMatch(/no default browser/);
    expect(argvFor('linux', deps({ answers: { 'xdg-settings': 'gone.desktop' } }).d)).toMatch(/wasn't found/);
  });

  it('Windows: runs the http UserChoice’s open command on the file, with no shell', () => {
    const { d } = deps({
      answers: {
        'reg query HKCU': '\r\nHKEY_CURRENT_USER\\...\\UserChoice\r\n    ProgId    REG_SZ    ChromeHTML\r\n',
        'reg query HKCR\\ChromeHTML\\shell\\open\\command':
          '\r\n    (Default)    REG_SZ    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --single-argument %1\r\n',
      },
    });
    const file = 'C:\\Users\\me & co\\AppData\\sign-in-1^2.html';
    const h = httpHandler('win32', d);
    expect(h.kind === 'app' && h.command(file)).toEqual([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ['--single-argument', file],
    ]);
  });

  it('Windows: a quoted %1, or none at all, still gets the file once', () => {
    const { d } = deps({
      answers: {
        'reg query HKCU': '    ProgId    REG_SZ    FirefoxURL-308046B0AF4A39CB',
        'reg query HKCR': '    (Default)    REG_SZ    "C:\\Firefox\\firefox.exe" -osint -url "%1"',
      },
    });
    expect(argvFor('win32', d)).toEqual(['C:\\Firefox\\firefox.exe', ['-osint', '-url', FILE]]);
    const bare = deps({
      answers: {
        'reg query HKCU': '    ProgId    REG_SZ    Edge',
        'reg query HKCR': '    (Default)    REG_SZ    "C:\\Edge\\msedge.exe"',
      },
    });
    expect(argvFor('win32', bare.d)).toEqual(['C:\\Edge\\msedge.exe', [FILE]]);
  });

  it('Windows: none when the registry names no http browser', () => {
    expect(argvFor('win32', deps({}).d)).toMatch(/couldn't read the default browser/);
    expect(argvFor('win32', deps({ answers: { reg: 'nothing here' } }).d)).toMatch(/no default browser/);
  });
});
