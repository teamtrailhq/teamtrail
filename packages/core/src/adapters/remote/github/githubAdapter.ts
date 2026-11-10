import { cachedUntilFailure } from '../../../lib/cachedUntilFailure';
import { BRAND, MAP_LABEL, PLAN_ONLY_LABEL } from '../../../model/brand';
import { guardMarkers } from '../../../model/safeText';
import type {
  DecisionRecord,
  MapDoc,
  MapMode,
  MapSnapshot,
  MapSummary,
  Ticket,
  TicketType,
} from '../../../model/types';
import type { MapInput } from '../../adapter';
import {
  authoredBody,
  decisionComment,
  mapLabels,
  mapBody,
  ticketFromIssue,
  ticketLabels,
  ticketBody,
} from '../format';
import { TrackerError, type HttpOptions } from '../http';
import { SyncedAdapter } from '../sync/syncedAdapter';
import type { RemoteComment, SyncOptions } from '../sync/types';
import { ensureGitHubLabels } from './ensureGitHubLabels';
import { GitHubClient } from './githubClient';
import { readTrail } from './readTrail';
import { labelNames, TRAIL_QUERY, type GqlIssue, type RestIssue } from './schema';

/*
 * GitHub Issues mapping:
 *   trail    issue labelled MAP_LABEL; body = canonical map body (mapBody.ts)
 *   ticket     sub-issue of the trail issue, labelled teamtrail:<type>
 *   blockedBy  native issue dependency ("blocked by")
 *   close      closed as completed / not planned
 *   decision   comment on the ticket (format.ts)
 * Reads: one GraphQL query per trail. Polling: an ETag-conditional issue
 * list, so an idle repo costs nothing against the rate limit (304s are free).
 */

export interface GitHubOptions extends SyncOptions, HttpOptions {
  /** `owner/name`. */
  repo: string;
  token: string;
  /** REST base, default https://api.github.com (GitHub Enterprise: https://host/api/v3). */
  apiUrl?: string;
}

export class GitHubAdapter extends SyncedAdapter {
  readonly kind = 'github' as const;
  readonly label = 'GitHub Issues';
  readonly location: string;
  private gh: GitHubClient;
  /** Issue number → REST id (sub-issue and dependency endpoints take ids, not numbers). */
  private issueIds = new Map<string, number>();
  /** `<trail>/<D-n>` → comment id holding the record. */
  private decisionComments = new Map<string, number>();
  private etag?: string;
  private cursor?: string;

  constructor(o: GitHubOptions) {
    super({ pollMs: 8000, ...o });
    this.gh = new GitHubClient(o);
    this.location = `${this.gh.owner}/${this.gh.name}`;
  }

  protected rate() {
    return this.gh.rate;
  }

  private ensureLabels = cachedUntilFailure(() => ensureGitHubLabels(this.gh));

  protected async fetchMaps(): Promise<MapSummary[]> {
    const r = await this.gh.repo<RestIssue[]>(
      'GET',
      `/issues?labels=${encodeURIComponent(MAP_LABEL)}&state=all&per_page=100`,
    );
    return r.body
      .filter((i) => !i.pull_request)
      .map((i) => ({ id: String(i.number), key: `#${i.number}`, title: i.title }));
  }

  protected async fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }> {
    const data = await this.gh.gql<{ repository: { issue: GqlIssue | null } | null }>(TRAIL_QUERY, {
      owner: this.gh.owner,
      name: this.gh.name,
      number: Number(mapId),
    });
    const root = data.repository?.issue;
    if (!root || !root.labels.nodes.some((l) => l.name === MAP_LABEL))
      throw new TrackerError('not_found', `GitHub: #${mapId} is not a trail in ${this.location}`);
    const m = readTrail(mapId, root);
    for (const [n, id] of m.issueIds) this.issueIds.set(n, id);
    for (const [key, id] of m.decisionComments) this.decisionComments.set(key, id);
    return { snap: m.snap, decisions: m.decisions };
  }

  protected async changedSince(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    const r = await this.gh.repo<RestIssue[]>(
      'GET',
      '/issues?state=all&sort=updated&direction=desc&per_page=50',
      undefined,
      this.etag ? { 'If-None-Match': this.etag } : {},
    );
    if (r.status === 304) return [];
    this.etag = r.headers.get('etag') ?? undefined;
    const items = Array.isArray(r.body) ? r.body : [];
    const newest = items.reduce((m, i) => (i.updated_at > m ? i.updated_at : m), this.cursor ?? '');
    const since = this.cursor;
    this.cursor = newest;
    // the cached list predates this baseline: anything created in between only shows up through a full resync
    if (since === undefined) return 'all';
    const out: string[] = [];
    for (const i of items.filter((x) => x.updated_at > since && !x.pull_request)) {
      const trail = known(String(i.number));
      if (trail) out.push(trail);
      else if (labelNames(i.labels).some((l) => l.startsWith(`${BRAND.labelPrefix}:`))) return 'all';
    }
    return out;
  }

  private async issueId(number: string) {
    let id = this.issueIds.get(number);
    if (id === undefined) {
      id = (await this.gh.repo<RestIssue>('GET', `/issues/${number}`)).body.id;
      this.issueIds.set(number, id);
    }
    return id;
  }

  protected async remoteCreateMap(input: MapInput & { mode: MapMode }): Promise<MapDoc> {
    await this.ensureLabels();
    const { body: i } = await this.gh.repo<RestIssue>('POST', '/issues', {
      title: input.title,
      body: mapBody(input),
      labels: mapLabels(input.mode),
    });
    this.issueIds.set(String(i.number), i.id);
    return {
      id: String(i.number),
      key: `#${i.number}`,
      title: i.title,
      mode: input.mode,
      ...(input.verification ? { verification: input.verification } : {}),
      sections: input.sections,
      createdAt: Date.parse(i.created_at),
      updatedAt: Date.parse(i.updated_at),
    };
  }

  protected async remoteCreateTicket(
    map: MapDoc,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket> {
    await this.ensureLabels();
    const { body: i } = await this.gh.repo<RestIssue>('POST', '/issues', {
      title: input.title,
      body: guardMarkers(input.body),
      labels: ticketLabels(input.type, input.hitl),
    });
    this.issueIds.set(String(i.number), i.id);
    await this.gh.repo('POST', `/issues/${map.id}/sub_issues`, { sub_issue_id: i.id });
    return ticketFromIssue({
      id: String(i.number),
      key: `#${i.number}`,
      title: i.title,
      labels: labelNames(i.labels),
      body: i.body,
      closed: false,
      blockedBy: [],
      comments: [],
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    });
  }

  protected async remoteAddBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    await this.gh.repo('POST', `/issues/${blocked.id}/dependencies/blocked_by`, {
      issue_id: await this.issueId(blocker.id),
    });
  }

  protected async remoteRemoveBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    const path = `/issues/${blocked.id}/dependencies/blocked_by/${await this.issueId(blocker.id)}`;
    await this.gh.repo('DELETE', path).catch((e) => {
      if (!(e instanceof TrackerError && e.code === 'not_found')) throw e; // already removed
    });
  }

  protected async remoteEditTicket(_map: MapDoc, t: Ticket) {
    await this.gh.repo('PATCH', `/issues/${t.id}`, { title: t.title, body: ticketBody(t) });
  }

  protected async remoteReopen(_map: MapDoc, t: Ticket) {
    await this.gh.repo('PATCH', `/issues/${t.id}`, { state: 'open', state_reason: 'reopened' });
  }

  protected async remoteSetMeta(_map: MapDoc, t: Ticket) {
    await this.gh.repo('PATCH', `/issues/${t.id}`, { body: ticketBody(t) });
  }

  protected async remoteComment(_map: MapDoc, t: Ticket, c: RemoteComment) {
    await this.gh.repo('POST', `/issues/${t.id}/comments`, { body: authoredBody(c.author, c.body, c.writeId) });
  }

  protected async remoteClose(_map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned') {
    await this.gh.repo('PATCH', `/issues/${t.id}`, { state: 'closed', state_reason: reason });
  }

  protected async remoteUpdateMap(map: MapDoc) {
    await this.gh.repo('PATCH', `/issues/${map.id}`, { body: mapBody(map) });
  }

  protected async remoteSetMode(map: MapDoc, mode: MapMode) {
    if (mode === 'plan-only') await this.gh.repo('POST', `/issues/${map.id}/labels`, { labels: [PLAN_ONLY_LABEL] });
    else
      await this.gh.repo('DELETE', `/issues/${map.id}/labels/${encodeURIComponent(PLAN_ONLY_LABEL)}`).catch((e) => {
        if (!(e instanceof TrackerError && e.code === 'not_found')) throw e;
      });
  }

  protected async remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket) {
    const { body: c } = await this.gh.repo<{ id: number }>('POST', `/issues/${ticket?.id ?? map.id}/comments`, {
      body: decisionComment(d),
    });
    this.decisionComments.set(`${map.id}/${d.id}`, c.id);
  }

  protected async remoteUpdateDecision(map: MapDoc, d: DecisionRecord) {
    const id = this.decisionComments.get(`${map.id}/${d.id}`);
    if (id === undefined) throw new TrackerError('not_found', `GitHub: no comment holds decision ${d.id}`);
    await this.gh.repo('PATCH', `/issues/comments/${id}`, { body: decisionComment(d) });
  }
}
