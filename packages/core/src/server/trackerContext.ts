import type { TrackerAdapter } from '../adapters/adapter';
import { overrideUrl } from '../lib/overrideUrl';
import { BRAND } from '../model/brand';
import {
  configDir,
  credentialStore,
  detectGitHubRepo,
  projectConfig,
  resolveGitHubToken,
  run,
  type Run,
} from './trackerConfig';

export interface TrackerRoutesOptions {
  /** Tracker folder; `trackers.json` lives here. */
  root: string;
  /** Repo checkout, for detecting the GitHub `origin`. */
  cwd?: string;
  /** Answers when the project uses local markdown. */
  markdown: TrackerAdapter;
  env?: Record<string, string | undefined>;
  exec?: Run;
  fetch?: typeof fetch;
  configDir?: string;
}

/** Configuration, credentials and lookups shared by the tracker routes. */
export function trackerContext(o: TrackerRoutesOptions) {
  const env = o.env ?? process.env;
  const exec = o.exec ?? run;
  const project = projectConfig(o.root);
  const creds = credentialStore(o.configDir ?? configDir(env));
  let detected: Promise<string | undefined> | undefined;
  let ghToken: { at: number; value: ReturnType<typeof resolveGitHubToken> } | undefined;
  return {
    o,
    env,
    exec,
    project,
    creds,
    apiUrl: {
      github: overrideUrl(env, `${BRAND.slug.toUpperCase()}_GITHUB_API`),
      linear: overrideUrl(env, `${BRAND.slug.toUpperCase()}_LINEAR_API`),
      /** github.com's OAuth endpoints (device flow); the fake GitHub's base in the end-to-end check. */
      githubWeb: overrideUrl(env, `${BRAND.slug.toUpperCase()}_GITHUB_WEB`),
    },
    /** Resolved at most every 30 s: `gh auth token` spawns a process. */
    githubToken() {
      if (!ghToken || Date.now() - ghToken.at > 30_000)
        ghToken = { at: Date.now(), value: resolveGitHubToken(creds.read(), env, exec) };
      return ghToken.value;
    },
    forgetGitHubToken() {
      ghToken = undefined;
    },
    detectedRepo() {
      detected ??= detectGitHubRepo(o.cwd ?? process.cwd(), exec);
      return detected;
    },
  };
}

export type TrackerContext = ReturnType<typeof trackerContext>;
