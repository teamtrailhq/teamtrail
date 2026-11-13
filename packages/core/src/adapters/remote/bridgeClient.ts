import { Emitter } from '../../lib/emitter';
import type { MapMetaPatch, TicketMetaPatch } from '../../model/lifecycle';
import type {
  DecisionInput,
  DecisionRecord,
  MapDoc,
  MapMode,
  MapSections,
  MapSnapshot,
  MapSummary,
  Ticket,
  TicketType,
  TrackerEvent,
} from '../../model/types';
import type { MapInput, TicketEdit, TrackerAdapter } from '../adapter';
import { TrackerError } from './http';
import type { GitHubSignInPoll, GitHubSignInStart } from './signInTypes';
import type { SyncStatus } from './sync/types';
import type {
  GitHubRepoList,
  LinearProjectList,
  LinearTeamList,
  RemoteKind,
  TrackerConnectRequest,
  TrackerSettings,
  TrackerTestRequest,
  TrackerTestResult,
} from './types';

const LABELS: Record<RemoteKind, string> = { github: 'GitHub Issues', linear: 'Linear' };

/** What BridgeAdapter needs of an event stream: a browser EventSource, or one that signs in before it connects. */
export interface EventStreamLike {
  addEventListener(type: string, listener: (e: Event) => void): void;
  close(): void;
}

async function post<T>(url: string, method: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new TrackerError('offline', 'Lookout server unreachable; is `teamtrail` still running?');
  }
  const j = (await r.json().catch(() => ({}))) as {
    result?: T;
    error?: string;
    code?: TrackerError['code'];
    resetAt?: number;
  } & T;
  if (!r.ok) throw new TrackerError(j.code ?? 'http', j.error ?? `request failed (${r.status})`, r.status, j.resetAt);
  return j as T;
}

/**
 * A GitHub or Linear tracker as seen from the browser. The real adapter and
 * its credentials live in the local `teamtrail` process; this forwards calls
 * and streams its events, so tokens never reach the page.
 */
export class BridgeAdapter implements TrackerAdapter {
  readonly label: string;
  location: string;
  status: SyncStatus = { state: 'connecting', queued: 0 };
  private events = new Emitter<TrackerEvent>();
  private statusEvents = new Emitter<SyncStatus>();
  private source?: EventStreamLike;
  private listeners = 0;
  /**
   * Opens an event stream at `path` under the bridge. A bare EventSource can't send a session, so a page behind
   * the Lookout's sign-in sets one that gets a stream ticket first.
   */
  openEvents: (path: string) => EventStreamLike = (path) => new EventSource(`${this.base}${path}`);

  constructor(
    readonly kind: RemoteKind,
    private base: string,
    location = '',
  ) {
    this.label = LABELS[kind];
    this.location = location;
  }

  private async call<T>(method: keyof TrackerAdapter, ...args: unknown[]): Promise<T> {
    return (await post<{ result: T }>(`${this.base}/tracker/${this.kind}/call`, 'POST', { method, args })).result;
  }

  listMaps = () => this.call<MapSummary[]>('listMaps');
  loadMap = (mapId: string) => this.call<MapSnapshot>('loadMap', mapId);
  createMap = (input: MapInput) => this.call<MapDoc>('createMap', input);
  setMapMode = (mapId: string, mode: MapMode) => this.call<void>('setMapMode', mapId, mode);
  setMapArchived = (mapId: string, archived: boolean) => this.call<void>('setMapArchived', mapId, archived);
  setMapMeta = (mapId: string, patch: MapMetaPatch) => this.call<void>('setMapMeta', mapId, patch);
  updateMapSections = (mapId: string, patch: Partial<MapSections>) =>
    this.call<void>('updateMapSections', mapId, patch);
  createTicket = (mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }) =>
    this.call<Ticket>('createTicket', mapId, input);
  addBlocking = (mapId: string, blockerId: string, blockedId: string) =>
    this.call<void>('addBlocking', mapId, blockerId, blockedId);
  removeBlocking = (mapId: string, blockerId: string, blockedId: string) =>
    this.call<void>('removeBlocking', mapId, blockerId, blockedId);
  editTicket = (mapId: string, ticketId: string, edit: TicketEdit) =>
    this.call<void>('editTicket', mapId, ticketId, edit);
  reopen = (mapId: string, ticketId: string) => this.call<void>('reopen', mapId, ticketId);
  assign = (mapId: string, ticketId: string, assignee: string | null) =>
    this.call<void>('assign', mapId, ticketId, assignee);
  comment = (mapId: string, ticketId: string, author: string, body: string) =>
    this.call<void>('comment', mapId, ticketId, author, body);
  close = (mapId: string, ticketId: string, reason: 'completed' | 'not_planned') =>
    this.call<void>('close', mapId, ticketId, reason);
  setMeta = (mapId: string, ticketId: string, patch: TicketMetaPatch) =>
    this.call<void>('setMeta', mapId, ticketId, patch);
  listDecisions = (mapId: string) => this.call<DecisionRecord[]>('listDecisions', mapId);
  createDecision = (mapId: string, input: DecisionInput) => this.call<DecisionRecord>('createDecision', mapId, input);
  markSuperseded = (mapId: string, decisionId: string, supersededBy: string) =>
    this.call<void>('markSuperseded', mapId, decisionId, supersededBy);

  private open() {
    const es = this.openEvents(`/tracker/${this.kind}/events`);
    es.addEventListener('message', (m) => this.events.emit(JSON.parse((m as MessageEvent).data) as TrackerEvent));
    es.addEventListener('status', (m) => {
      const s = JSON.parse((m as MessageEvent).data) as SyncStatus & { location?: string };
      if (s.location) this.location = s.location;
      this.status = s;
      this.statusEvents.emit(s);
    });
    es.addEventListener('error', () => {
      if (this.status.state === 'offline') return;
      this.status = { ...this.status, state: 'offline', error: 'Lookout server unreachable' };
      this.statusEvents.emit(this.status);
    });
    this.source = es;
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    const off = this.events.on(listener);
    if (++this.listeners === 1) this.open();
    return () => {
      off();
      if (--this.listeners === 0) {
        this.source?.close();
        this.source = undefined;
      }
    };
  }

  onStatus(fn: (s: SyncStatus) => void) {
    return this.statusEvents.on(fn);
  }
}

/** Settings calls to the local bridge. */
export function trackerSettingsApi(base: string) {
  return {
    get: () => post<TrackerSettings>(`${base}/trackers`, 'GET'),
    test: (req: TrackerTestRequest) => post<TrackerTestResult>(`${base}/trackers/test`, 'POST', req),
    connect: (req: TrackerConnectRequest) => post<TrackerSettings>(`${base}/trackers`, 'PUT', req),
    forget: (kind: RemoteKind) => post<TrackerSettings>(`${base}/trackers/credentials/${kind}`, 'DELETE'),
    /** The repos the found GitHub token can track issues in, with its login. */
    githubRepos: () => post<GitHubRepoList>(`${base}/trackers/github/repos`, 'GET'),
    /** Sign in with GitHub (device flow): start, ask where it stands, give up, and sign out. */
    githubSignIn: {
      start: () => post<GitHubSignInStart>(`${base}/trackers/github/sign-in/start`, 'POST'),
      poll: () => post<GitHubSignInPoll>(`${base}/trackers/github/sign-in/poll`, 'POST'),
      cancel: () => post<unknown>(`${base}/trackers/github/sign-in/cancel`, 'POST'),
      signOut: () => post<TrackerSettings>(`${base}/trackers/github/sign-in`, 'DELETE'),
    },
    /** The teams a Linear key can access, with who it belongs to: the found key, or `apiKey` pasted in the page. */
    linearTeams: (apiKey?: string) =>
      apiKey
        ? post<LinearTeamList>(`${base}/trackers/linear/teams`, 'POST', { apiKey })
        : post<LinearTeamList>(`${base}/trackers/linear/teams`, 'GET'),
    /** The projects of one Linear team. */
    linearProjects: (teamId: string, apiKey?: string) =>
      apiKey
        ? post<LinearProjectList>(`${base}/trackers/linear/projects`, 'POST', { apiKey, teamId })
        : post<LinearProjectList>(`${base}/trackers/linear/projects?team=${encodeURIComponent(teamId)}`, 'GET'),
  };
}
