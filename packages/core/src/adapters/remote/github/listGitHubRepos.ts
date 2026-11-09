import { HttpClient, github, type HttpOptions } from '../http';
import type { GitHubRepoOption } from '../types';
import { apiBase, restHeaders } from './schema';

interface RestRepo {
  full_name: string;
  private: boolean;
  archived?: boolean;
  has_issues: boolean;
  pushed_at?: string | null;
  permissions?: Record<string, boolean>;
}

/** Repos read before stopping; the picker still takes a typed `owner/name` past it. */
const REPO_CAP = 300;
const PER_PAGE = 100;

/** The `rel="next"` URL of a GitHub `Link` header. */
function nextLink(link: string | null): string | undefined {
  if (!link) return undefined;
  return link.match(/<([^>]+)>\s*;\s*rel="next"/)?.[1];
}

const canTrack = (r: RestRepo) => {
  const p = r.permissions ?? {};
  return r.has_issues && !r.archived && !!(p.push || p.triage || p.maintain || p.admin);
};

/**
 * The repos a token can track issues in, most recently pushed first: owned, collaborator and organisation repos
 * with issues on and push or triage rights. Reads at most `cap` repos, following `Link` pages. Throws a
 * `TrackerError` when GitHub refuses.
 */
export async function listGitHubRepos(
  o: { token: string; apiUrl?: string; cap?: number } & HttpOptions,
): Promise<{ repos: GitHubRepoOption[]; truncated: boolean }> {
  const cap = o.cap ?? REPO_CAP;
  const http = new HttpClient(github, { retries: 1, ...o });
  const headers = restHeaders(o.token);
  const query = `affiliation=owner,collaborator,organization_member&sort=pushed&per_page=${PER_PAGE}`;
  let url: string | undefined = `${apiBase(o.apiUrl)}/user/repos?${query}`;
  const seen: RestRepo[] = [];
  while (url && seen.length < cap) {
    const res: { body: RestRepo[]; headers: Headers } = await http.send<RestRepo[]>(url, { headers });
    seen.push(...(Array.isArray(res.body) ? res.body : []));
    url = nextLink(res.headers.get('link'));
  }
  const repos = seen
    .slice(0, cap)
    .filter(canTrack)
    .map((r) => ({ fullName: r.full_name, private: r.private, pushedAt: r.pushed_at ?? undefined }));
  return { repos, truncated: !!url || seen.length > cap };
}
