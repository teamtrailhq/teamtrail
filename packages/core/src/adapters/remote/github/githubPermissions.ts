import { TrackerError } from '../http';
import type { GitHubClient } from './githubClient';

/** How long an answer is kept; after a failure GitHub might clear up on its own, the last answer holds this long, once. */
const OK_MS = 5 * 60_000;
const GRACE_MS = 30_000;
const WRITE_ROLES = new Set(['admin', 'maintain', 'write']);

interface Known {
  at: number;
  ttl: number;
  write: boolean;
  /** Kept from before a failure; never kept again. */
  grace?: boolean;
}

/** GitHub didn't answer this time (a server error, rate limiting, the network): it may well answer next time. */
const passing = (err: unknown) =>
  !(err instanceof TrackerError) ||
  err.code === 'offline' ||
  err.code === 'rate_limited' ||
  (err.code === 'http' && (err.status ?? 500) >= 500);

/**
 * Which logins can write to the repo, asked of GitHub per login
 * (`GET /repos/<o>/<r>/collaborators/<login>/permission`) and cached briefly. The adapter is built per token, so
 * the cache is per token too. A clear answer counts at once: admin, maintain or write can write; read, triage,
 * none, or not a collaborator at all (404) can't. Only when GitHub fails to answer does the last answer hold, for
 * one 30-second window that is never renewed.
 */
export class GitHubPermissions {
  private known = new Map<string, Known>();

  constructor(
    private readonly gh: GitHubClient,
    private readonly now: () => number,
  ) {}

  /** Looks up the logins not known (or stale), then answers from the cache. */
  async resolve(logins: string[]): Promise<(login: string) => boolean> {
    const stale = logins.filter((l) => {
      const k = this.known.get(l.toLowerCase());
      return !k || this.now() - k.at >= k.ttl;
    });
    await Promise.all(stale.map((l) => this.lookUp(l)));
    return (login) => this.known.get(login.toLowerCase())?.write ?? false;
  }

  private async lookUp(login: string) {
    const key = login.toLowerCase();
    try {
      const path = `/collaborators/${encodeURIComponent(login)}/permission`;
      const { body } = await this.gh.repo<{ permission?: string; role_name?: string }>('GET', path);
      const write = WRITE_ROLES.has(body.role_name ?? '') || WRITE_ROLES.has(body.permission ?? '');
      this.known.set(key, { at: this.now(), ttl: OK_MS, write });
    } catch (err) {
      const prev = this.known.get(key);
      const keep = passing(err) && !!prev && !prev.grace && prev.write;
      this.known.set(key, { at: this.now(), ttl: GRACE_MS, write: keep, grace: true });
    }
  }
}
