import { BRAND } from '../../../model/brand';
import { ChangeWindow, type Stamped } from '../sync/changeWindow';
import type { GitHubClient } from './githubClient';
import { labelNames, type RestIssue } from './schema';

/** Issues per poll; a full page means more changed than one page holds, so everything cached is read again. */
const PAGE = 100;
/** The cursor before a repo has any issue. */
const EPOCH = '1970-01-01T00:00:00Z';

/**
 * Which trails changed in a GitHub repo since the last poll: the repo's issues sorted by update, from the cursor on
 * (`since` is inclusive, so a change in the same second as the last one seen still shows). ETag-conditional, so an
 * idle repo costs nothing against the rate limit (304s are free).
 */
export class GitHubChanges {
  private etag?: { path: string; tag: string };
  private window = new ChangeWindow();

  constructor(private readonly gh: GitHubClient) {}

  /** `known` maps an issue number to its cached trail; `'all'` when the trail list may have changed too. */
  async poll(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    const since = this.window.since;
    const from = since ? `&since=${encodeURIComponent(windowStart(since))}` : '';
    const path = `/issues?state=all&sort=updated&direction=desc&per_page=${PAGE}${from}`;
    const ifNoneMatch: Record<string, string> = this.etag?.path === path ? { 'If-None-Match': this.etag.tag } : {};
    const r = await this.gh.repo<RestIssue[]>('GET', path, undefined, ifNoneMatch);
    if (r.status === 304) return [];
    const tag = r.headers.get('etag');
    this.etag = tag ? { path, tag } : undefined;
    const items = Array.isArray(r.body) ? r.body : [];
    const stamped: Stamped[] = items.map((i) => ({ key: String(i.number), at: i.updated_at }));
    // the cached list predates this baseline: anything created in between only shows up through a full resync
    if (since === undefined) {
      this.window.start(stamped[0]?.at ?? EPOCH, stamped);
      return 'all';
    }
    const fresh = new Set(this.window.take(stamped).map((s) => s.key));
    // a full page that doesn't reach back past the cursor may have left changes out: read everything again
    if (items.length >= PAGE && (stamped.at(-1)?.at ?? '') >= since) return 'all';
    return trailsOf(
      items.filter((i) => fresh.has(String(i.number)) && !i.pull_request),
      known,
    );
  }
}

/**
 * What to ask GitHub for: the start of the minute a second before the cursor. GitHub documents `since` as "updated
 * after", so asking a little earlier keeps the cursor's own second in the answer whichever way it compares (the window
 * leaves out what it already saw), and a whole minute keeps the request the same while the cursor moves within it,
 * so the next idle poll is a free 304.
 */
function windowStart(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const minute = Math.floor((ms - 1000) / 60_000) * 60_000;
  return new Date(minute).toISOString().replace('.000Z', 'Z');
}

/** The cached trails these issues belong to, or `'all'` when one is a Teamtrail issue no cached trail holds. */
function trailsOf(items: RestIssue[], known: (ref: string) => string | undefined): string[] | 'all' {
  const out: string[] = [];
  for (const i of items) {
    const trail = known(String(i.number));
    if (trail) out.push(trail);
    else if (labelNames(i.labels).some((l) => l.startsWith(`${BRAND.labelPrefix}:`))) return 'all';
  }
  return out;
}
