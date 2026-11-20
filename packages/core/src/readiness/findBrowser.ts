import { readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findProgram } from './findProgram';

/** Variables browser test runners read for the browser to start. */
const VARS = ['CHROME', 'CHROME_BIN', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];

const MAC = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const PROGRAMS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge'];
const WINDOWS = ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'];

const isFile = (f: string) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
};

/** Playwright's own browsers, where it downloads them (or where PLAYWRIGHT_BROWSERS_PATH says). */
function playwrightBrowsers(env: NodeJS.ProcessEnv): string | undefined {
  const home = os.homedir();
  const dirs = [
    env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
    path.join(home, '.cache', 'ms-playwright'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'ms-playwright'),
  ].filter((d): d is string => !!d && path.isAbsolute(d));
  for (const dir of dirs) {
    try {
      if (readdirSync(dir).some((n) => /^(chromium|firefox|webkit)/.test(n))) return dir;
    } catch {
      // not there
    }
  }
  return undefined;
}

/**
 * A browser the checks can start, and where: a path a test runner's variable names, Chrome, Chromium or Edge where
 * the system keeps them or on PATH, or Playwright's downloaded browsers. File checks only; nothing is started.
 */
export function findBrowser(env: NodeJS.ProcessEnv): { found: boolean; where?: string } {
  const named = VARS.map((v) => env[v]).find((f) => !!f && path.isAbsolute(f) && isFile(f));
  if (named) return { found: true, where: named };
  const program = PROGRAMS.map((p) => findProgram(p, env)).find(Boolean);
  if (program) return { found: true, where: program };
  const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((r): r is string => !!r);
  const system = [...(process.platform === 'darwin' ? MAC : [])].concat(
    process.platform === 'win32' ? roots.flatMap((r) => WINDOWS.map((w) => path.join(r, w))) : [],
  );
  const installed = system.find(isFile);
  if (installed) return { found: true, where: installed };
  const playwright = playwrightBrowsers(env);
  return playwright ? { found: true, where: playwright } : { found: false };
}
