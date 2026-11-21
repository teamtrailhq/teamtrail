import type { PendingQuestion } from '@teamtrail/core';
import { LabelLine, MetaLine } from '../../components/ui';
import { hm } from '../../lib';
import { QuestionAvatar } from './QuestionAvatar';

/**
 * The question you're answering, pinned between the transcript and the suggested replies so it never scrolls out
 * of view in a short column. Scout sits beside it; the text scrolls on its own if it's very long. When answering
 * decides something (a ticket that is yours to decide, a setting of yours), a meta line says what, so a one-click
 * reply is never a surprise. Answered in an agent's chat already, it says so: that only guided the agent, and the
 * answer given here is the one that decides.
 */
export function OpenQuestion(props: { q: PendingQuestion; chatId?: string }) {
  const { q } = props;
  return (
    <div className="msg open-q">
      <LabelLine tone="urgent" parts={[q.agent, hm(q.at), 'asks you']} />
      <QuestionAvatar id={props.chatId ?? q.id} text={q.text} />
      <div className="msg-text">{q.text}</div>
      {q.stakes && <MetaLine parts={[{ text: q.stakes, strong: true }]} />}
      {q.precedent && <MetaLine className="open-q-precedent" parts={[q.precedent]} />}
      {q.guidance && (
        <MetaLine
          parts={[`Answered in ${q.guidance.chatOf ?? 'an agent'}'s chat as guidance`, 'your answer here decides']}
        />
      )}
    </div>
  );
}
