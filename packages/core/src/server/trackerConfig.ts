import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ActiveTracker, CredentialSource, LinearTarget } from '../adapters/remote/types';
import { BRAND } from '../model/brand';

/*
 * Two files, both on the user's machine only:
 *   <tracker dir>/trackers.json         which tracker the project uses (repo, team). No secrets; safe to commit.
 *   <config dir>/credentials.json       tokens and API keys, mode 0600, never inside the repo.
 * <config dir> = $TEAMTRAIL_CONFIG_DIR, else $XDG_CONFIG_HOME/teamtrail, else ~/.config/teamtrail (%APPDATA%\teamtrail on Windows).
 */

export interface ProjectTrackerConfig {
  active: ActiveTracker;
  github?: { repo: string };
  linear?: LinearTarget;
}

export interface Credentials {
  github?: { token: string };
  /** The token from "Sign in with GitHub" (OAuth device flow, `repo` scope), kept apart from a pasted token. */
  githubSignIn?: { token: string; scope?: string; at: string };
  linear?: { apiKey: string };
  /** Socket Mode app-level token (`xapp-…`) and bot token (`xoxb-…`) of the user's own Slack app. */
  slack?: { appToken?: string; botToken?: string };
}

type Env = Record<string, string | undefined>;

export function configDir(env: Env = process.env) {
  const own = env[`${BRAND.slug.toUpperCase()}_CONFIG_DIR`];
  if (own) return own;
  const base =
    env.XDG_CONFIG_HOME || (process.platform === 'win32' && env.APPDATA) || path.join(os.homedir(), '.config');
  return path.join(base, BRAND.slug);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return fallback;
  }
}

/** Write-then-rename so a crash never leaves half a file; `mode` applies before the file is visible. */
function writeJson(file: string, value: unknown, mode?: number) {
  mkdirSync(path.dirname(file), { recursive: true, ...(mode ? { mode: 0o700 } : {}) });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', mode ? { mode } : {});
  renameSync(tmp, file);
  if (mode) chmodSync(file, mode);
}

export function projectConfig(trackerRoot: string) {
  const file = path.join(trackerRoot, 'trackers.json');
  return {
    file,
    read: (): ProjectTrackerConfig => readJson<ProjectTrackerConfig>(file, { active: 'markdown' }),
    write: (c: ProjectTrackerConfig) => writeJson(file, c),
  };
}

export function credentialStore(dir = configDir()) {
  const file = path.join(dir, 'credentials.json');
  return {
    file,
    read: (): Credentials => readJson<Credentials>(file, {}),
    write: (c: Credentials) => writeJson(file, c, 0o600),
  };
}

export type Run = (cmd: string, args: string[], cwd?: string) => Promise<string>;

export const run: Run = (cmd, args, cwd) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { cwd, timeout: 5000, windowsHide: true }, (err, stdout) =>
      err ? reject(err) : resolve(String(stdout).trim()),
    ),
  );

/**
 * First usable GitHub token:
 *   1. a token pasted in Settings ('stored'),
 *   2. $GITHUB_TOKEN, then $GH_TOKEN (set on purpose for this shell or CI),
 *   3. the token from Sign in with GitHub ('signed-in'), chosen in Teamtrail so it beats an ambient gh login,
 *   4. `gh auth token`.
 * Signing in drops a pasted token, so whichever of the two was set last is the one used.
 */
export async function resolveGitHubToken(
  creds: Credentials,
  env: Env = process.env,
  exec: Run = run,
): Promise<{ token: string; source: CredentialSource } | null> {
  if (creds.github?.token) return { token: creds.github.token, source: 'stored' };
  if (env.GITHUB_TOKEN) return { token: env.GITHUB_TOKEN, source: 'GITHUB_TOKEN' };
  if (env.GH_TOKEN) return { token: env.GH_TOKEN, source: 'GH_TOKEN' };
  if (creds.githubSignIn?.token) return { token: creds.githubSignIn.token, source: 'signed-in' };
  const token = await exec('gh', ['auth', 'token']).catch(() => '');
  return token ? { token, source: 'gh' } : null;
}

export function resolveLinearKey(
  creds: Credentials,
  env: Env = process.env,
): { token: string; source: CredentialSource } | null {
  if (creds.linear?.apiKey) return { token: creds.linear.apiKey, source: 'stored' };
  if (env.LINEAR_API_KEY) return { token: env.LINEAR_API_KEY, source: 'LINEAR_API_KEY' };
  return null;
}

/** `owner/name` from a GitHub remote URL (https, ssh, or git@ form). */
export function parseGitHubRemote(url: string): string | undefined {
  const m = url.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

export async function detectGitHubRepo(cwd: string, exec: Run = run): Promise<string | undefined> {
  const url = await exec('git', ['remote', 'get-url', 'origin'], cwd).catch(() => '');
  return url ? parseGitHubRemote(url) : undefined;
}
