import { apiBase, restHeaders } from '../../adapters/remote/github/schema';
import { HttpClient, TrackerError, github, type HttpOptions } from '../../adapters/remote/http';
import type { ProofPublisher, ProofStatusCall } from '../../model/proofPost';

export interface GitHubProofOptions extends HttpOptions {
  /** `owner/name`. */
  repo: string;
  token: string;
  apiUrl?: string;
}

interface GhComment {
  id: number;
  html_url: string;
  body?: string | null;
  user: { login: string } | null;
}

const MARKER = '<!-- teamtrail:proof ';
const SHA = /^[0-9a-f]{40}$/i;
/** Comments read when looking for the proof: ten pages of a hundred. */
const PAGES = 10;
export const PROOF_STATUS_CONTEXT = 'Teamtrail proof';

/**
 * Writes a ticket's proof to one pull request: the comment that starts with the proof marker and was written by this
 * token's own account (edited in place, never another account's), and the `Teamtrail proof` commit status.
 */
export class GitHubProofPublisher implements ProofPublisher {
  readonly repo: string;
  readonly #token: string;
  readonly #http: HttpClient;
  readonly #base: string;
  readonly #api: string;
  #login?: string;

  constructor(o: GitHubProofOptions) {
    const [owner, name] = o.repo.split('/');
    if (!owner || !name) throw new TrackerError('invalid', `GitHub repo must be "owner/name", got "${o.repo}"`);
    this.repo = o.repo;
    this.#token = o.token;
    this.#http = new HttpClient(github, o);
    this.#api = apiBase(o.apiUrl);
    this.#base = `${this.#api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }

  async #call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const headers = { ...restHeaders(this.#token), ...(body ? { 'Content-Type': 'application/json' } : {}) };
    const init = { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) };
    return (await this.#http.send<T>(url, init)).body;
  }

  async #viewer() {
    this.#login ??= (await this.#call<{ login: string }>(`${this.#api}/user`)).login;
    return this.#login;
  }

  async #findOwn(pr: number): Promise<GhComment | undefined> {
    const login = (await this.#viewer()).toLowerCase();
    for (let page = 1; page <= PAGES; page++) {
      const list = await this.#call<GhComment[]>(`${this.#base}/issues/${pr}/comments?per_page=100&page=${page}`);
      const own = list.find((c) => c.user?.login.toLowerCase() === login && c.body?.startsWith(MARKER));
      if (own || list.length < 100) return own;
    }
    return undefined;
  }

  /** The PR's head commit and every text on it that holds a Teamtrail proof: its description, then its comments. */
  async proofTexts(pr: number): Promise<{ headSha: string; texts: string[] }> {
    const p = await this.#call<{ body?: string | null; head: { sha: string } }>(`${this.#base}/pulls/${pr}`);
    const texts = [p.body ?? ''];
    for (let page = 1; page <= PAGES; page++) {
      const list = await this.#call<GhComment[]>(`${this.#base}/issues/${pr}/comments?per_page=100&page=${page}`);
      texts.push(...list.map((c) => c.body ?? ''));
      if (list.length < 100) break;
    }
    return { headSha: p.head.sha, texts: texts.filter((t) => t.includes(MARKER)) };
  }

  async upsertComment(pr: number, body: string) {
    if (!Number.isInteger(pr) || pr <= 0) throw new TrackerError('invalid', `not a pull request number: ${pr}`);
    const own = await this.#findOwn(pr);
    const url = own ? `${this.#base}/issues/comments/${own.id}` : `${this.#base}/issues/${pr}/comments`;
    const c = await this.#call<GhComment>(url, own ? 'PATCH' : 'POST', { body });
    return { url: c.html_url };
  }

  async setStatus(sha: string, s: ProofStatusCall & { targetUrl?: string; context?: string }) {
    if (!SHA.test(sha)) throw new TrackerError('invalid', 'the pull request head is not a full commit sha');
    await this.#call(`${this.#base}/statuses/${sha}`, 'POST', {
      state: s.state,
      description: s.description,
      context: s.context ?? PROOF_STATUS_CONTEXT,
      ...(s.targetUrl ? { target_url: s.targetUrl } : {}),
    });
  }
}
