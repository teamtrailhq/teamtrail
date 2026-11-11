import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { linuxHttpHandler } from './linuxHttpHandler';
import { macHttpHandler } from './macHttpHandler';
import type { HandlerDeps, HttpHandler } from './types';
import { windowsHttpHandler } from './windowsHttpHandler';

const DEFAULT_DEPS: HandlerDeps = {
  run: (cmd, args) =>
    execFileSync(cmd, args, { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }),
  env: process.env,
  readFile: (file) => {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
  },
  home: os.homedir(),
};

/** This machine's browser for http links (types.ts), on this platform. */
export function httpHandler(
  platform: NodeJS.Platform = process.platform,
  deps: HandlerDeps = DEFAULT_DEPS,
): HttpHandler {
  if (platform === 'darwin') return macHttpHandler(deps);
  if (platform === 'win32') return windowsHttpHandler(deps);
  return linuxHttpHandler(deps);
}
