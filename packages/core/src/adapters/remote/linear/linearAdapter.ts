import { cachedUntilFailure } from '../../../lib/cachedUntilFailure';
import { ARCHIVED_LABEL, MAP_LABEL, PLAN_ONLY_LABEL } from '../../../model/brand';
import { guardMarkers } from '../../../model/safeText';
import type { DecisionRecord, MapDoc, MapMode, MapSnapshot, Ticket, TicketType } from '../../../model/types';
import type { MapInput } from '../../adapter';
import { decisionComment } from '../decisionComment';
import { authoredBody, mapLabels, mapBody, mapSettings, ticketBody, ticketLabels } from '../format';
import { HttpClient, TrackerError, linear, type HttpOptions } from '../http';
import { SettingsLedger, type AcceptedStore } from '../settingsLedger';
import { SyncedAdapter } from '../sync/syncedAdapter';
import type { RemoteComment, SyncOptions } from '../sync/types';
import { changedTrails } from './changedTrails';
import { linearGql, type LinearGql } from './linearGql';
import { fetchLinearTeam } from './linearTeam';
import { linearWrites, type LinearWrites } from './linearWrites';
import { listLinearTrails } from './listLinearTrails';
import { linearTicket, readTrail, type DecisionFound } from './readTrail';
import { removeBlocksRelation } from './removeBlocksRelation';
import { CHANGES_QUERY, TRAIL_QUERY, type LChanges, type LIssue } from './schema';

/*
 * Linear mapping:
 *   trail    issue labelled MAP_LABEL in the team (and project, when set); description = canonical map body
 *   ticket     sub-issue (parentId = trail), labelled teamtrail:<type>
 *   blockedBy  native "blocks" relation
 *   close      the team's first "completed" state, or its first "canceled" state for not planned
 *   decision   comment on the ticket (decisionComment.ts)
 * Reads: one query per trail, which also says who the key is: markers in comments count only from that user, or
 * as a teammate's; a description's settings only once this machine put or accepted them (linear/readTrail.ts).
 * Polling: issues and comments with `updatedAt > cursor`, one request per poll.
 */

export interface LinearOptions extends SyncOptions, HttpOptions {
  /** Personal API key (`lin_api_…`) or an OAuth access token. */
  apiKey: string;
  teamId: string;
  projectId?: string;
  apiUrl?: string;
  /** Header location, e.g. `ENG · Mobile`; defaults to the team key once known. */
  display?: string;
  /** Where this machine keeps the settings it accepted per issue; in memory without one. */
  accepted?: AcceptedStore;
}

export class LinearAdapter extends SyncedAdapter {
  readonly kind = 'linear' as const;
  readonly label = 'Linear';
  location: string;
  private http: HttpClient;
  private gql: LinearGql;
  private decisionComments = new Map<string, string>();
  private cursor?: string;
  private ledger: SettingsLedger;
  private mutations: LinearWrites;
  private found: DecisionFound = (d, commentId) => this.decisionComments.set(`${d.mapId}/${d.id}`, commentId);

  constructor(private o: LinearOptions) {
    super({ pollMs: 12_000, ...o });
    this.http = new HttpClient(linear, o);
    this.gql = linearGql(this.http, o.apiKey, o.apiUrl);
    this.ledger = new SettingsLedger(async () => {
      const d = await this.gql<{ viewer?: { id: string } | null }>('query Me { viewer { id } }');
      return d.viewer?.id;
    }, o.accepted);
    this.mutations = linearWrites(this.gql, o);
    this.location = o.display ?? o.teamId;
  }

  protected rate() {
    return this.http.rate;
  }

  unacceptedSettings = () => this.ledger.unaccepted();
  settingsSkipped = () => this.ledger.skipped;

  /** Team states and Teamtrail labels, creating missing labels once. */
  private meta = cachedUntilFailure(async () => {
    const team = await fetchLinearTeam(this.gql, this.o.teamId);
    if (!this.o.display) this.location = team.key;
    return team;
  });

  private async labelIds(names: string[]) {
    const { labels } = await this.meta();
    return names.map((n) => labels.get(n)).filter((x): x is string => !!x);
  }

  private trailFilter() {
    return {
      team: { id: { eq: this.o.teamId } },
      labels: { some: { name: { eq: MAP_LABEL } } },
      ...(this.o.projectId ? { project: { id: { eq: this.o.projectId } } } : {}),
    };
  }

  protected fetchMaps() {
    return listLinearTrails(this.gql, this.trailFilter());
  }

  protected async fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }> {
    type Trail = { viewer?: { id: string } | null; issue: LIssue | null };
    const d = await this.gql<Trail>(TRAIL_QUERY, { id: mapId });
    const root = d.issue;
    if (!root || !root.labels.nodes.some((l) => l.name === MAP_LABEL))
      throw new TrackerError('not_found', `Linear: ${mapId} is not a trail`);
    const gate = this.ledger.gate({ mapId, now: this.now(), viewer: d.viewer?.id });
    const trail = readTrail(mapId, root, { viewer: d.viewer?.id, gate, found: this.found });
    await gate.save();
    return trail;
  }

  protected async changedSince(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    if (this.cursor === undefined) {
      this.cursor = new Date(this.now()).toISOString();
      return 'all';
    }
    const since = this.cursor;
    const d = await this.gql<LChanges>(CHANGES_QUERY, {
      issues: { team: { id: { eq: this.o.teamId } }, updatedAt: { gt: since } },
      comments: { updatedAt: { gt: since }, issue: { team: { id: { eq: this.o.teamId } } } },
    });
    const stamps = [...d.issues.nodes.map((i) => i.updatedAt), ...d.comments.nodes.map((c) => c.updatedAt)];
    this.cursor = stamps.reduce((m, s) => (s > m ? s : m), since);
    return changedTrails(d, known);
  }

  protected async remoteCreateMap(input: MapInput & { mode: MapMode }): Promise<MapDoc> {
    const i = await this.mutations.create({
      title: input.title,
      description: mapBody(input),
      labelIds: await this.labelIds(mapLabels(input.mode)),
    });
    await this.ledger.wrote(i.id, mapSettings(input));
    return {
      id: i.id,
      key: i.identifier,
      title: i.title,
      mode: input.mode,
      ...(input.verification ? { verification: input.verification } : {}),
      sections: input.sections,
      createdAt: Date.parse(i.createdAt),
      updatedAt: Date.parse(i.updatedAt),
    };
  }

  protected async remoteCreateTicket(
    map: MapDoc,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket> {
    const i = await this.mutations.create({
      title: input.title,
      description: guardMarkers(input.body),
      parentId: map.id,
      labelIds: await this.labelIds(ticketLabels(input.type, input.hitl)),
    });
    await this.ledger.wrote(i.id, {});
    return linearTicket(map.id, i, new Set(), { viewer: undefined, found: this.found });
  }

  protected async remoteAddBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    await this.gql(
      `mutation Block($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`,
      {
        input: { issueId: blocker.id, relatedIssueId: blocked.id, type: 'blocks' },
      },
    );
  }

  protected async remoteRemoveBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    await removeBlocksRelation(this.gql, blocker.id, blocked.id);
  }

  protected async remoteEditTicket(_map: MapDoc, t: Ticket) {
    const edit = { title: t.title, description: ticketBody(t) };
    await this.ledger.writeTicket(t, () => this.mutations.update(t.id, edit));
  }

  protected async remoteReopen(_map: MapDoc, t: Ticket) {
    const m = await this.meta();
    if (!m.open) throw new TrackerError('invalid', `Linear: team ${m.key} has no unstarted or backlog state`);
    await this.mutations.update(t.id, { stateId: m.open });
  }

  protected async remoteSetMeta(_map: MapDoc, t: Ticket, o?: { confirm?: boolean }) {
    const send = () => this.mutations.update(t.id, { description: ticketBody(t) });
    await this.ledger.writeTicket(t, send, o?.confirm);
  }

  protected async remoteComment(_map: MapDoc, t: Ticket, c: RemoteComment) {
    await this.mutations.comment(t.id, authoredBody(c.author, c.body, c.writeId));
  }

  protected async remoteClose(_map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned') {
    const m = await this.meta();
    const stateId = reason === 'completed' ? m.done : m.canceled || m.done;
    if (!stateId)
      throw new TrackerError(
        'invalid',
        `Linear: team ${m.key} has no ${reason === 'completed' ? 'completed' : 'canceled'} state`,
      );
    await this.mutations.update(t.id, { stateId });
  }

  protected async remoteUpdateMap(map: MapDoc, o?: { confirm?: boolean }) {
    const send = () => this.mutations.update(map.id, { description: mapBody(map) });
    await this.ledger.writeMap(map, send, o?.confirm);
  }

  protected async remoteSetMode(map: MapDoc, mode: MapMode) {
    const ids = await this.labelIds([PLAN_ONLY_LABEL]);
    await this.mutations.update(map.id, mode === 'plan-only' ? { addedLabelIds: ids } : { removedLabelIds: ids });
  }

  protected async remoteSetArchived(map: MapDoc, archived: boolean) {
    const ids = await this.labelIds([ARCHIVED_LABEL]);
    await this.mutations.update(map.id, archived ? { addedLabelIds: ids } : { removedLabelIds: ids });
  }

  protected async remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket) {
    this.decisionComments.set(
      `${map.id}/${d.id}`,
      await this.mutations.comment(ticket?.id ?? map.id, decisionComment(d)),
    );
  }

  protected async remoteUpdateDecision(map: MapDoc, d: DecisionRecord) {
    const id = this.decisionComments.get(`${map.id}/${d.id}`);
    if (!id) throw new TrackerError('not_found', `Linear: no comment holds decision ${d.id}`);
    await this.mutations.editComment(id, decisionComment(d));
  }
}
