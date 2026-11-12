import { chatNote, type ActivityState } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { actorLabel, clock } from '../../lib';
import { useSlackPeople } from '../slack';

type Message = ActivityState['chats'][number];

/**
 * One line of the transcript: who and when in the meta role, then the text. Agent lines sit left, yours right;
 * a side question that's still open offers "Answer this". An answer given in an agent's chat says so ("in
 * claude-01's chat"): it guided the agent, and approves nothing.
 */
export function ChatMessage(props: { m: Message; stillOpen: boolean; onAnswerThis: () => void }) {
  const { m } = props;
  const people = useSlackPeople();
  const voice = m.from === 'human' ? 'human' : 'agent';
  return (
    <div className={`msg from-${m.from} voice-${voice}`}>
      <MetaLine parts={[actorLabel(m.author, people), chatNote(m), clock(m.at)]} />
      <div className="msg-text">{m.text}</div>
      {props.stillOpen && (
        <button className="answer-this t-meta" onClick={props.onAnswerThis}>
          Answer this
        </button>
      )}
    </div>
  );
}
