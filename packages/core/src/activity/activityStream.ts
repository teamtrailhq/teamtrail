import { Emitter, uid } from '../lib/emitter';
import { labelOf, type AnswerHow } from '../model/answerVia';
import { BRAND } from '../model/brand';
import { STEPS } from '../model/steps';
import type {
  AnsweredQuestion,
  ChatMessage,
  FeedEntry,
  PendingQuestion,
  QuestionGuidance,
  SessionInfo,
  SessionMode,
  SessionUsage,
} from '../model/types';
import { answeredEntry } from './answeredEntry';
import type { NotUsedAnswer } from './notUsedAnswer';
import { withRemoteSlice, type RemoteSlice } from './remoteSlice';
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
  /** Who waits for a question's first chat answer (`awaitGuidance`). */
  private guides = new Map<string, (g: QuestionGuidance) => void>();
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

  /**
   * Deliver a human answer to a pending question, with how it was given (model/answerVia.ts): the caller's own
   * path says, never the answer's input. Left out only for answers from before labels, which count as chat.
   */
  answer(questionId: string, text: string, author: string, how: AnswerHow) {
    const q = this.state.pending.find((p) => p.id === questionId);
    const resolveFn = this.resolvers.get(questionId);
    const remote = !!q && this.remote.has(q.sessionId) && !!this.remoteAnswer;
    if (!q || (!resolveFn && !remote)) return false;
    this.resolvers.delete(questionId);
    this.guides.delete(questionId);
    const label = labelOf(how);
    const by = how.by ? { by: how.by } : {};
    const chat = { sessionId: q.sessionId, ticketId: q.ticketId, from: 'human' as const, author, text };
    this.chat({ ...chat, answers: questionId, ...label, ...by });
    this.set({
      pending: this.state.pending.filter((p) => p.id !== questionId),
      answered: [...this.state.answered, answeredEntry(q, { ...label, ...by })].slice(-200),
    });
    this.patchSession(q.sessionId, { waitingOn: undefined });
    this.push({
      source: 'trail lead',
      agent: author,
      level: 'ok',
      kind: 'answered',
      ticketId: q.ticketId,
      sessionId: q.sessionId,
      text: `Answered ${q.agent}`,
    });
    if (resolveFn) resolveFn(text);
    else this.remoteAnswer!(q, text, author);
    return true;
  }

  /**
   * An answer given in an agent's chat (answer_question, model/answerVia.ts `closesQuestion`): kept in the
   * conversation as guidance and handed to whoever waits for it (`awaitGuidance`), while the question stays open
   * for the human, whose answer in the Lookout or Slack is the one used. The first one is what the question shows
   * (`guidance`); the agent stops waiting on it. False when the question isn't open.
   */
  guide(questionId: string, text: string, author: string, how: AnswerHow) {
    const q = this.state.pending.find((p) => p.id === questionId);
    if (!q) return false;
    const label = labelOf(how);
    const said = { sessionId: q.sessionId, ticketId: q.ticketId, from: 'human' as const, author, text };
    this.chat({ ...said, answers: questionId, guidance: true, ...label });
    if (q.guidance) return true;
    const guidance: QuestionGuidance = {
      text,
      author,
      at: Date.now(),
      ...(label.chatOf ? { chatOf: label.chatOf } : {}),
    };
    this.set({ pending: this.state.pending.map((p) => (p.id === questionId ? { ...p, guidance } : p)) });
    if (this.state.sessions.find((s) => s.id === q.sessionId)?.waitingOn === questionId)
      this.patchSession(q.sessionId, { waitingOn: undefined });
    this.push({
      source: 'trail lead',
      agent: author,
      level: 'info',
      ticketId: q.ticketId,
      sessionId: q.sessionId,
      text: `Guided ${q.agent} from a chat: the question stays open for an answer in the Lookout or Slack`,
    });
    this.guides.get(questionId)?.(guidance);
    this.guides.delete(questionId);
    return true;
  }

  /** Whether a session waits on a question for the human's answer (wait_for_answer after guidance), shown as idle. */
  waiting(sessionId: string, questionId: string | undefined) {
    this.patchSession(sessionId, { waitingOn: questionId });
  }

  /** The first chat answer to a question (`guide`), as guidance, once it is given. */
  awaitGuidance(questionId: string) {
    return new Promise<QuestionGuidance>((r) => this.guides.set(questionId, r));
  }

  /**
   * Keep answers that came after the one used (agentDocWriter.ts) in the question's conversation, marked not used:
   * nothing the human said is lost, and nothing reads them as the answer. False when the question wasn't answered.
   */
  notUsed(questionId: string, answers: NotUsedAnswer[]) {
    const done = this.state.answered.find((a) => a.id === questionId);
    if (!done) return false;
    const ticket = done.ticketId ? { ticketId: done.ticketId } : {};
    for (const a of answers) {
      const by = a.how.by ? { by: a.how.by } : {};
      const said = { sessionId: done.sessionId, ...ticket, from: 'human' as const, author: a.author, text: a.text };
      this.chat({ ...said, answers: questionId, notUsed: true, ...labelOf(a.how), ...by });
    }
    return true;
  }

  /**
   * Mirror a session owned by another process: its info, conversation, feed lines
   * and open questions are replaced by the latest report; answers merge in.
   */
  syncRemote(doc: RemoteSlice) {
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
    this.set({ ...withRemoteSlice(this.state, doc, this.maxFeed), usageByMap });
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
