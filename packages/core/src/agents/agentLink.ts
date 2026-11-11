import type { AnsweredQuestion, ChatMessage, FeedEntry, PendingQuestion, SessionInfo } from '../model/types';

/**
 * How agent sessions running in other processes (the `teamtrail mcp` server an
 * agent connects to) reach the Lookout. Each process writes one JSON
 * document per session; the Lookout mirrors them and writes answers back:
 *
 *   <tracker>/.agents/sessions/<sessionId>.json             AgentSessionDoc, written only by the owning process
 *   <tracker>/.agents/answers/<sessionId>/<questionId>.json AgentAnswer, written by whoever answers and signed with
 *                                                           this machine's key (agentAnswerSignature.ts)
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
  answer: (sessionId: string, questionId: string) => `${AGENTS_DIR}/answers/${sessionId}/${questionId}.json`,
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
  pid: number;
  updatedAt: number;
}

export interface AgentAnswer {
  sessionId: string;
  questionId: string;
  text: string;
  /** Actor id of who answered, e.g. `trail lead`. */
  author: string;
  at: number;
  /** This machine's signature of the fields above. An answer without a valid one is not the human's. */
  sig?: string;
}

export interface LookoutLock {
  url: string;
  pid: number;
  startedAt: number;
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
        text: 'Agent disconnected',
      },
    ],
  };
}
