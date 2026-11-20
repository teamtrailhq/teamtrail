import { questionHeadline, type AttentionItem } from '@teamtrail/core';
import { useRef, useState } from 'react';
import { Clamp, Empty, MetaLine } from '../../components/ui';
import { detailReasons } from '../attention';
import { AnswerArea } from '../inbox';
import type { NeedContext } from './types';

/**
 * An agent's question, answered in place: the question in full under the row's headline (unless the headline says
 * it all), what is at stake (else why it ranks here), every suggested answer and an
 * answer in your words, then the way to its ticket or the whole conversation.
 */
export function QuestionBody({ item, ctx }: { item: AttentionItem; ctx: NeedContext }) {
  const q = ctx.api.activity.pending.find((p) => p.id === item.ref);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  if (!q) return <Empty>Answered.</Empty>;
  const send = (text: string) => {
    if (!text.trim()) return;
    ctx.api.actions.answer(q.id, text.trim());
    setDraft('');
  };
  const ticketId = q.ticketId;
  return (
    <>
      {!questionHeadline(q).whole && <Clamp key={q.id} text={q.text} markdown className="question-body" />}
      <MetaLine parts={q.stakes ? [{ text: q.stakes, strong: true }] : detailReasons(item)} />
      {q.precedent && <MetaLine parts={[q.precedent]} />}
      <div className="home-answer">
        <AnswerArea
          pending={q}
          draft={draft}
          onDraft={setDraft}
          onSend={send}
          inputRef={inputRef}
          placeholder="Answer in your words"
        />
      </div>
      <div className="home-need-links">
        {ticketId && (
          <button type="button" className="link" onClick={() => ctx.openTicket(q.mapId, ticketId)}>
            Open ticket
          </button>
        )}
        <button type="button" className="link" onClick={() => ctx.openChat(q.sessionId)}>
          The whole conversation
        </button>
      </div>
    </>
  );
}
