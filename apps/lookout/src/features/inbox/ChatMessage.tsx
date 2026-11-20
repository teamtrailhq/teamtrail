import { chatNote, type ActivityState } from '@teamtrail/core';
import { LabelLine } from '../../components/ui';
import { actorLabel, hm } from '../../lib';
import { useSlackPeople } from '../slack';
import { answeredLine } from './answeredLine';

type Message = ActivityState['chats'][number];

/**
 * One line of the transcript, as the scenes have it: a mono label line (who, when, "asks" on a question) over a
 * square box. Agent lines sit left, yours right; under an answer of yours that counts as your word, a green
 * "Answered · in the Lookout" line says so. An answer given in an agent's chat says that instead ("in claude-01's
 * chat"): it guided the agent, and approves nothing. A side question that's still open offers "Answer this".
 */
export function ChatMessage(props: { m: Message; stillOpen: boolean; onAnswerThis: () => void }) {
  const { m } = props;
  const people = useSlackPeople();
  const voice = m.from === 'human' ? 'human' : 'agent';
  const counted = answeredLine(m);
  return (
    <div className={`msg from-${m.from} voice-${voice}`}>
      <LabelLine parts={[actorLabel(m.by?.name ?? m.author, people), hm(m.at), m.questionId && 'asks', chatNote(m)]} />
      <div className="msg-text">{m.text}</div>
      {counted && <LabelLine className="msg-counted" tone="ok" parts={counted} />}
      {props.stillOpen && (
        <button className="answer-this t-meta" onClick={props.onAnswerThis}>
          Answer this
        </button>
      )}
    </div>
  );
}
