import type { AnsweredQuestion, ChatMessage, FeedEntry, PendingQuestion, SessionInfo } from '../model/types';
import type { ActivityState } from './activityStream';

/** One session's slice as another process reports it (agents/agentLink.ts `AgentSessionDoc`). */
export interface RemoteSlice {
  session: SessionInfo;
  chats: ChatMessage[];
  pending: PendingQuestion[];
  answered: AnsweredQuestion[];
  feed: FeedEntry[];
}

/**
 * The state with a session from another process mirrored in: its info, conversation, feed lines and open
 * questions replaced by the latest report; answers merged in.
 */
export function withRemoteSlice(
  state: ActivityState,
  doc: RemoteSlice,
  maxFeed: number,
): Pick<ActivityState, 'sessions' | 'chats' | 'pending' | 'answered' | 'feed'> {
  const { session } = doc;
  const sid = session.id;
  const others = <T extends { sessionId: string }>(xs: T[]) => xs.filter((x) => x.sessionId !== sid);
  const answeredIds = new Set(state.answered.map((a) => a.id));
  const sessions = state.sessions.some((s) => s.id === sid)
    ? state.sessions.map((s) => (s.id === sid ? session : s))
    : [...state.sessions, session].slice(-24);
  return {
    sessions,
    chats: [...others(state.chats), ...doc.chats].sort((a, b) => a.at - b.at).slice(-600),
    pending: [...others(state.pending), ...doc.pending],
    answered: [...state.answered, ...doc.answered.filter((a) => !answeredIds.has(a.id))]
      .sort((a, b) => a.answeredAt - b.answeredAt)
      .slice(-200),
    feed: [...state.feed.filter((f) => f.sessionId !== sid), ...doc.feed].sort((a, b) => a.at - b.at).slice(-maxFeed),
  };
}
