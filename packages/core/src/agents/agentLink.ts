import type { AnswerVia } from '../model/answerVia';
import type { Person } from '../model/person';
import type { AnsweredQuestion, ChatMessage, FeedEntry, PendingQuestion, SessionInfo } from '../model/types';

/**
 * How agent sessions running in other processes (the `teamtrail mcp` server an
 * agent connects to) reach the Lookout. Each process writes one JSON
 * document per session; the Lookout mirrors them and writes answers back:
 *
 *   <tracker>/.agents/sessions/<sessionId>.json             AgentSessionDoc, written only by the owning process
 *   <tracker>/.agents/answers/<sessionId>/<questionId>/<n>.json  AgentAnswer, one file per answer, written by whoever
 *                                                           answers and signed with this machine's key
 *                                                           (agentAnswerSignature.ts); the first valid one by `n` is
 *                                                           the answer, later ones are kept as not used (answerFiles.ts)
 *   <tracker>/.agents/answers/<sessionId>/<questionId>.json the one answer file older versions use: still read,
 *                                                           and written for an asking process that predates numbered files
 *   <tracker>/.agents/server.json                           LookoutLock, while `teamtrail` is serving
 *   <tracker>/.agents/hosts/<agent>-<hostSessionId>.json    HostSessionLink, written by the agent's session hook
 *
 * Plain files keep it local, survive restarts on either side and need no ports.
 */
export const AGENTS_DIR = '.agents';

export const agentPaths = {
  sessions: `${AGENTS_DIR}/sessions`,
  session: (sessionId: string) => `${AGENTS_DIR}/sessions/${sessionId}.json`,
  answers: (sessionId: string) => `${AGENTS_DIR}/answers/${sessionId}`,
  /** The single answer file of older versions (and for an asking process that predates numbered answers). */
  answer: (sessionId: string, questionId: string) => `${AGENTS_DIR}/answers/${sessionId}/${questionId}.json`,
  /** One numbered file per answer given to the question (answerFiles.ts). */
  answerDir: (sessionId: string, questionId: string) => `${AGENTS_DIR}/answers/${sessionId}/${questionId}`,
  lock: `${AGENTS_DIR}/server.json`,
  hosts: `${AGENTS_DIR}/hosts`,
  host: (agent: string, hostSessionId: string) =>
    `${AGENTS_DIR}/hosts/${agent}-${hostSessionId.replace(/[^\w.-]/g, '_')}.json`,
};

/** Where a host agent (Claude Code) keeps the log of one of its sessions, as its SessionStart hook reported it. */
export interface HostSessionLink {
  agent: 'claude-code';
  hostSessionId: string;
  transcriptPath: string;
  cwd?: string;
  /** SessionStart source: startup, resume, clear, compact. */
  source?: string;
  at: number;
}

export const isAgentPath = (rel: string) => rel === AGENTS_DIR || rel.startsWith(`${AGENTS_DIR}/`);
export const SESSION_DOC_PATH = /^\.agents\/sessions\/([^/]+)\.json$/;

/** One agent session's slice of activity, as its process last reported it. */
export interface AgentSessionDoc {
  v: 1;
  session: SessionInfo;
  chats: ChatMessage[];
  pending: PendingQuestion[];
  answered: AnsweredQuestion[];
  feed: FeedEntry[];
  /** Client that connected, e.g. `claude-code 2.1.0`. */
  client?: string;
  /** The Teamtrail version of the process that writes it; absent from versions before it was written. */
  teamtrail?: string;
  /**
   * `2` when the process reads numbered answer files (answerFiles.ts); absent from older ones, which are given the
   * single answer file they read.
   */
  answerFormat?: typeof ANSWER_FORMAT;
  pid: number;
  updatedAt: number;
}

/** The answer layout this version reads: one numbered file per answer, the first valid one used. */
export const ANSWER_FORMAT = 2;

export interface AgentAnswer {
  sessionId: string;
  questionId: string;
  text: string;
  /** Actor id of who answered, e.g. `trail lead`. */
  author: string;
  at: number;
  /**
   * How it was given: set by the path that wrote it (the Lookout's bridge, Slack, answer_question), never by what
   * was sent to it, and signed with the rest. Absent on answers written before labels; those count as chat.
   */
  via?: AnswerVia;
  /** For `chat`: the agent whose chat it was given in. */
  chatOf?: string;
  /** Who gave it, when the sign-in named them (model/person.ts); signed on its own (`sigBy`). */
  by?: Person;
  /** The Teamtrail version that wrote it, to say so when the asking agent runs another one. Not signed. */
  writer?: string;
  /** This machine's signature of the answer (all but the label). An answer without a valid one is not the human's. */
  sig?: string;
  /** This machine's signature of the answer with its label: without a valid one, the label doesn't count. */
  sigVia?: string;
  /** This machine's signature of the answer with who gave it: without a valid one, nobody is named. */
  sigBy?: string;
}

/** The answer that came first, as told to whoever gave a later one: theirs is kept, but not used. */
export interface FirstAnswer {
  text: string;
  author: string;
  at: number;
  /** How it was given, as far as that verifies (agentAnswerSignature.ts). */
  via?: AnswerVia;
  chatOf?: string;
  by?: Person;
}

/** An answer as written, with the one that came before it when it isn't the one used. */
export type WrittenAnswer = AgentAnswer & { firstAnswer?: FirstAnswer };

export interface LookoutLock {
  url: string;
  pid: number;
  startedAt: number;
  /** The Teamtrail version the Lookout runs; absent from versions before it was written. */
  version?: string;
  /** This machine's signature of the lock (machine/announcementSig.ts): only then is its URL offered as a link. */
  sig?: string;
}

/** A doc whose process is gone while the session still claims to run: show it as ended, with nothing left pending. */
export function markDisconnected(doc: AgentSessionDoc): AgentSessionDoc {
  if (doc.session.status !== 'running') return doc;
  return {
    ...doc,
    session: { ...doc.session, status: 'failed', waitingOn: undefined, endedAt: doc.updatedAt },
    pending: [],
    feed: [
      ...doc.feed,
      {
        id: `${doc.session.id}-gone`,
        at: doc.updatedAt,
        source: 'session',
        sessionId: doc.session.id,
        agent: doc.session.agent,
        level: 'alert',
        kind: 'disconnected',
        text: 'Agent disconnected',
      },
    ],
  };
}
