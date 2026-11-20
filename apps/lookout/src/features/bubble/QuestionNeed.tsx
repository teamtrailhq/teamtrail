import { questionHeadline, type PendingQuestion } from '@teamtrail/core';
import { useRef, useState } from 'react';
import { Clamp, MetaLine } from '../../components/ui';
import { ago } from '../../lib';
import { AnswerArea } from '../inbox';

/**
 * An agent's question, answered in place: its headline (the agent's summary, else its first sentence), who asks and
 * what it holds up, the question in full at body size (cut after a few lines, so the answer stays in reach), then its
 * suggested replies and a free answer. The whole conversation is one click away.
 */
export function QuestionNeed(props: {
  q: PendingQuestion;
  now: number;
  keyOf: (ticketId: string) => string | undefined;
  onAnswer: (questionId: string, text: string) => void;
  onOpenChat: (sessionId: string) => void;
}) {
  const { q } = props;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blocks = (q.blocks ?? []).map(props.keyOf).filter(Boolean);
  const headline = questionHeadline(q);
  const send = (text: string) => {
    if (!text.trim()) return;
    props.onAnswer(q.id, text.trim());
    setDraft('');
  };
  return (
    <div className="bubble-need open-q">
      <span className="t-label urgent">Waiting on you</span>
      <h3 className="bubble-title">{headline.text}</h3>
      <MetaLine
        parts={[`${q.agent} asks`, blocks.length > 0 && `blocks ${blocks.join(' and ')}`, ago(props.now - q.at)]}
      />
      {!headline.whole && <Clamp key={q.id} text={q.text} markdown className="question-body" />}
      {q.stakes && <MetaLine parts={[{ text: q.stakes, strong: true }]} />}
      {q.precedent && <MetaLine className="open-q-precedent" parts={[q.precedent]} />}
      <div className="bubble-answer">
        <AnswerArea pending={q} draft={draft} onDraft={setDraft} onSend={send} inputRef={inputRef} />
      </div>
      <button type="button" className="link" onClick={() => props.onOpenChat(q.sessionId)}>
        The whole conversation
      </button>
    </div>
  );
}
