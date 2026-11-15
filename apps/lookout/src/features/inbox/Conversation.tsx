import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import { useState, useRef, useEffect } from 'react';
import { SectionHeader, Empty } from '../../components/ui';
import { isRunning, pickPending } from '../../lib';
import { AnswerArea } from './AnswerArea';
import { ChatMessage } from './ChatMessage';
import { ConversationTicket } from './ConversationTicket';
import { OpenQuestion } from './OpenQuestion';

/**
 * The HITL line: the ticket as the zone's title, the transcript (scrolls), the open question pinned under it, then
 * the suggested replies and the answer row. Red only while your answer is needed.
 */
export function Conversation(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  sessionId?: string;
  /** The question the trail lead opened, when the agent has more than one open. */
  questionId?: string;
  onAnswer: (questionId: string, text: string) => void;
  onBack?: () => void;
}) {
  const { activity, sessionId } = props;
  const [draft, setDraft] = useState('');
  const [chosen, setChosen] = useState<string>();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const session = activity.sessions.find((s) => s.id === sessionId);
  const messages = activity.chats.filter((m) => m.sessionId === sessionId);
  const pending = pickPending(activity.pending, sessionId, chosen ?? props.questionId);
  const openIds = new Set(activity.pending.filter((p) => p.sessionId === sessionId).map((p) => p.id));
  const openChat = messages.find((m) => !!pending && m.questionId === pending.id);
  const history = messages.filter((m) => m !== openChat);
  const trail = session ? props.snaps[session.mapId] : undefined;
  const ticket = session?.ticketId ? trail?.tickets.find((t) => t.id === session.ticketId) : undefined;

  useEffect(() => {
    const log = logRef.current;
    log?.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  }, [history.length, pending?.id]);
  useEffect(() => {
    if (pending && !props.onBack) inputRef.current?.focus({ preventScroll: true });
    // Refocus only when a different question arrives, not on every update of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id, props.onBack]);

  const send = (text: string) => {
    if (!pending || !text.trim()) return;
    props.onAnswer(pending.id, text.trim());
    setDraft('');
  };
  const status = statusLine(session, !!pending);

  return (
    <div className={`comms ${pending ? 'asking' : ''}`}>
      <SectionHeader
        title="HITL line"
        right={session ? <span className={`status ${pending ? 'urgent' : ''}`}>{status}</span> : undefined}
      >
        {props.onBack && (
          <button className="back" onClick={props.onBack} aria-label="Back to inbox">
            ‹ Inbox
          </button>
        )}
      </SectionHeader>
      {!session ? (
        <Empty>No conversation</Empty>
      ) : (
        <>
          <ConversationTicket ticket={ticket} trail={trail?.map.title} agent={session.agent} />
          <div className="comms-log" ref={logRef}>
            {history.map((m) => (
              <ChatMessage
                key={m.id}
                m={m}
                stillOpen={!!m.questionId && openIds.has(m.questionId)}
                onAnswerThis={() => setChosen(m.questionId)}
              />
            ))}
          </div>
          {pending && <OpenQuestion q={pending} chatId={openChat?.id} />}
          <AnswerArea pending={pending} draft={draft} onDraft={setDraft} onSend={send} inputRef={inputRef} />
        </>
      )}
    </div>
  );
}

type Session = ActivityState['sessions'][number];

function statusLine(session: Session | undefined, asking: boolean) {
  if (!session) return '';
  if (asking) return 'Your answer is needed';
  if (isRunning(session)) return `${session.agent} is working…`;
  if (session.status === 'done') return 'Resolved · ticket closed';
  return 'Session ended';
}
