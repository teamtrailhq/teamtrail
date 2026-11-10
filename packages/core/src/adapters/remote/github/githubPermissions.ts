import type { GitHubClient } from './githubClient';

/** How long an answer is kept; a failed lookup is retried sooner, keeping the last known answer meanwhile. */
const OK_MS = 5 * 60_000;
const FAILED_MS = 30_000;
const WRITE_ROLES = new Set(['admin', 'maintain', 'write']);

interface Known {
  at: number;
  ttl: number;
  write: boolean;
}

/**
 * Which logins can write to the repo, asked of GitHub per login
 * (`GET /repos/<o>/<r>/collaborators/<login>/permission`) and cached briefly. The adapter is built per token, so
 * the cache is per token too. Read-only collaborators, triagers and org members without access can't write.
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
    } catch {
      // not a collaborator (404), or GitHub didn't answer: no write access until it says otherwise
      const prev = this.known.get(key);
      this.known.set(key, { at: this.now(), ttl: FAILED_MS, write: prev?.write ?? false });
    }
  }
}
