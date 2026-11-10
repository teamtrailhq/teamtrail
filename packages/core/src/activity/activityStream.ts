import { Emitter, uid } from '../lib/emitter';
import { BRAND } from '../model/brand';
import { STEPS } from '../model/steps';
import type {
  AnsweredQuestion,
  ChatMessage,
  FeedEntry,
  PendingQuestion,
  SessionInfo,
  SessionMode,
  SessionUsage,
} from '../model/types';
import { createSessionHandle, type SessionHandle, type SessionHost } from './sessionHandle';
import { addUsage, subUsage } from './usage';
import type { UsageLedger } from './usageLedger';

export interface ActivityState {
  sessions: SessionInfo[];
  feed: FeedEntry[];
  chats: ChatMessage[];
  /** Questions agents are blocked on. Non-empty = "waiting on you". */
  pending: PendingQuestion[];
  /** Answered questions with ask/answer times, for HITL response time. */
  answered: AnsweredQuestion[];
  /** Cumulative model usage per map, kept after sessions scroll out of `sessions`. */
  usageByMap: Record<string, SessionUsage>;
}

/**
 * Stream of agent-session activity (which procedure step each session is on,
 * and HITL conversations) merged with tracker events. Sessions are not tracker
 * state: in a real setup they would be reported by the CLI / MCP server as
 * agents call operations, and answers would be relayed back to the agent.
 */
export class ActivityStream {
  private state: ActivityState = { sessions: [], feed: [], chats: [], pending: [], answered: [], usageByMap: {} };
  private changes = new Emitter<ActivityState>();
  private resolvers = new Map<string, (answer: string) => void>();
  /** Sessions mirrored from another process (`syncRemote`), with the last usage total each reported. */
  private remote = new Map<string, SessionUsage | undefined>();
  /** Delivers trail lead answers to questions asked by remote sessions. */
  public remoteAnswer?: (q: PendingQuestion, text: string, author: string) => void;
  constructor(
    private readonly maxFeed = 400,
    /** Receives every usage report with its time, for spend-since readouts. Settable once storage is known. */
    public ledger?: UsageLedger,
  ) {}

  private readonly host: SessionHost = {
    find: (id) => this.state.sessions.find((s) => s.id === id),
    patchSession: (id, patch) => this.patchSession(id, patch),
    push: (e) => void this.push(e),
    chat: (m) => this.chat(m),
    addPending: (q) => this.set({ pending: [...this.state.pending, q] }),
    dropPending: (sessionId) => {
      const stale = this.state.pending.filter((p) => p.sessionId === sessionId);
      if (stale.length) this.set({ pending: this.state.pending.filter((p) => p.sessionId !== sessionId) });
    },
    awaitAnswer: (questionId) => new Promise<string>((r) => this.resolvers.set(questionId, r)),
    addMapUsage: (mapId, delta) => {
      this.state = {
        ...this.state,
        usageByMap: { ...this.state.usageByMap, [mapId]: addUsage(this.state.usageByMap[mapId], delta) },
      };
    },
    ledger: () => this.ledger,
  };

  get snapshot() {
    return this.state;
  }

  subscribe(fn: (s: ActivityState) => void) {
    return this.changes.on(fn);
  }

  private set(patch: Partial<ActivityState>) {
    this.state = { ...this.state, ...patch };
    this.changes.emit(this.state);
  }

  push(e: Omit<FeedEntry, 'id' | 'at'> & { at?: number }) {
    const entry: FeedEntry = { id: uid('f'), at: e.at ?? Date.now(), ...e };
    if (entry.source === 'system' && !entry.agent) entry.agent = BRAND.assistant.name;
    this.set({ feed: [...this.state.feed, entry].slice(-this.maxFeed) });
    return entry;
  }

  private patchSession(id: string, patch: Partial<SessionInfo>) {
    this.set({ sessions: this.state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  private chat(m: Omit<ChatMessage, 'id' | 'at'>) {
    this.set({ chats: [...this.state.chats, { id: uid('m'), at: Date.now(), ...m }].slice(-600) });
  }

  /** Deliver a human answer to a pending question. */
  answer(questionId: string, text: string, author: string) {
    const q = this.state.pending.find((p) => p.id === questionId);
    const resolveFn = this.resolvers.get(questionId);
    const remote = !!q && this.remote.has(q.sessionId) && !!this.remoteAnswer;
    if (!q || (!resolveFn && !remote)) return false;
    this.resolvers.delete(questionId);
    this.chat({ sessionId: q.sessionId, ticketId: q.ticketId, from: 'human', author, text });
    this.set({
      pending: this.state.pending.filter((p) => p.id !== questionId),
      answered: [
        ...this.state.answered,
        {
          id: q.id,
          mapId: q.mapId,
          sessionId: q.sessionId,
          agent: q.agent,
          askedAt: q.at,
          answeredAt: Date.now(),
          ...(q.ticketId ? { ticketId: q.ticketId } : {}),
          ...(q.category ? { category: q.category } : {}),
          ...(q.urgency ? { urgency: q.urgency } : {}),
        },
      ].slice(-200),
    });
    this.patchSession(q.sessionId, { waitingOn: undefined });
    this.push({
      source: 'trail lead',
      agent: author,
      level: 'ok',
      ticketId: q.ticketId,
      sessionId: q.sessionId,
      text: `Answered ${q.agent}`,
    });
    if (resolveFn) resolveFn(text);
    else this.remoteAnswer!(q, text, author);
    return true;
  }

  /**
   * Mirror a session owned by another process: its info, conversation, feed lines
   * and open questions are replaced by the latest report; answers merge in.
   */
  syncRemote(doc: {
    session: SessionInfo;
    chats: ChatMessage[];
    pending: PendingQuestion[];
    answered: AnsweredQuestion[];
    feed: FeedEntry[];
  }) {
    const { session } = doc;
    const sid = session.id;
    if (!this.remote.has(sid) && this.state.sessions.some((s) => s.id === sid)) return;
    const prevUsage = this.remote.get(sid);
    // Usage of a chart session counts once it is bound to its trail, so keep the baseline until then.
    this.remote.set(sid, session.mapId ? session.usage : prevUsage);
    let usageByMap = this.state.usageByMap;
    if (session.usage && session.mapId) {
      const d = subUsage(session.usage, prevUsage);
      if (d.inputTokens || d.outputTokens || d.costUsd)
        usageByMap = { ...usageByMap, [session.mapId]: addUsage(usageByMap[session.mapId], d) };
      this.ledger?.addTotal(session.mapId, sid, session.usage);
    }
    const others = <T extends { sessionId: string }>(xs: T[]) => xs.filter((x) => x.sessionId !== sid);
    const answeredIds = new Set(this.state.answered.map((a) => a.id));
    const sessions = this.state.sessions.some((s) => s.id === sid)
      ? this.state.sessions.map((s) => (s.id === sid ? session : s))
      : [...this.state.sessions, session].slice(-24);
    this.set({
      sessions,
      chats: [...others(this.state.chats), ...doc.chats].sort((a, b) => a.at - b.at).slice(-600),
      pending: [...others(this.state.pending), ...doc.pending],
      answered: [...this.state.answered, ...doc.answered.filter((a) => !answeredIds.has(a.id))]
        .sort((a, b) => a.answeredAt - b.answeredAt)
        .slice(-200),
      feed: [...this.state.feed.filter((f) => f.sessionId !== sid), ...doc.feed]
        .sort((a, b) => a.at - b.at)
        .slice(-this.maxFeed),
      usageByMap,
    });
  }

  /** True for sessions mirrored from another process. */
  isRemote(sessionId: string) {
    return this.remote.has(sessionId);
  }

  startSession(input: {
    agent: string;
    mode: SessionMode;
    mapId: string;
    ticketId?: string;
    id?: string;
  }): SessionHandle {
    const info: SessionInfo = {
      ...input,
      id: input.id ?? uid('s'),
      step: 0,
      total: STEPS[input.mode].length,
      stepLabel: 'BOOT',
      status: 'running',
      startedAt: Date.now(),
    };
    this.set({ sessions: [...this.state.sessions, info].slice(-24) });
    const handle = createSessionHandle(this.host, info, input.mode);
    this.push({
      source: 'session',
      sessionId: info.id,
      agent: info.agent,
      level: 'info',
      text: `Session opened · ${input.mode}`,
    });
    return handle;
  }
}
