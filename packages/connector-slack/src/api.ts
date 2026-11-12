/** The slice of the Slack Web API the connector uses. Read methods go as GET with a query string, writes as JSON. */

export class SlackApiError extends Error {
  constructor(
    readonly code: string,
    readonly method: string,
    readonly status?: number,
  ) {
    super(`${method}: ${code}`);
  }
}

const READS = new Set([
  'auth.test',
  'bots.info',
  'conversations.members',
  'conversations.replies',
  'chat.getPermalink',
  'users.info',
  'users.list',
  'users.lookupByEmail',
]);

export interface SlackApiOptions {
  token: string;
  /** Base URL ending in `/api` (default https://slack.com/api); $TEAMTRAIL_SLACK_API points it at a fake. */
  apiUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type SlackResponse = { ok: boolean; error?: string; [k: string]: unknown };

export class SlackApi {
  /** Scopes granted to the token, from the last response's `x-oauth-scopes`. */
  scopes?: string[];
  private base: string;
  private f: typeof fetch;
  private sleep: (ms: number) => Promise<void>;

  constructor(private o: SlackApiOptions) {
    this.base = (o.apiUrl ?? 'https://slack.com/api').replace(/\/$/, '');
    this.f = o.fetch ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async call<T = SlackResponse>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const read = READS.has(method);
    const qs = read
      ? new URLSearchParams(
          Object.entries(args)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]): [string, string] => [k, String(v)]),
        ).toString()
      : '';
    const url = `${this.base}/${method}${qs ? `?${qs}` : ''}`;
    const init: RequestInit = read
      ? { method: 'GET', headers: { Authorization: `Bearer ${this.o.token}` } }
      : {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.o.token}`, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(args),
        };
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.f(url, init);
      } catch {
        throw new SlackApiError('offline', method);
      }
      if (res.status === 429 && attempt < 2) {
        await this.sleep(Number(res.headers.get('retry-after') ?? 1) * 1000);
        continue;
      }
      const scopes = res.headers.get('x-oauth-scopes');
      if (scopes !== null)
        this.scopes = scopes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      const body = (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as SlackResponse;
      if (!body.ok) throw new SlackApiError(body.error ?? `http_${res.status}`, method, res.status);
      return body as T;
    }
  }
}

/** Every message Scout posts, edits or replies with goes out as written: no names or links parsed, no unfurls. */
export const AS_WRITTEN = { parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false } as const;

/** POST to a `response_url` (ephemeral replies to commands, shortcuts and button clicks), as written. */
export async function postResponse(url: string, body: object, f: typeof fetch = fetch) {
  await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ...body, ...AS_WRITTEN }),
  }).catch(() => {});
}
