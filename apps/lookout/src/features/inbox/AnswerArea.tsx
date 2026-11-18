import type { PendingQuestion } from '@teamtrail/core';
import type { RefObject } from 'react';
import { InputRow } from '../../components/ui';
import { HIGH_RISK_ELSEWHERE, highRiskElsewhere } from '../../lib/highRiskElsewhere';
import { Suggestions } from './Suggestions';

/**
 * Under the open question: the suggested replies and the answer row; for a high-risk question someone here may not
 * answer (an embedding server's sign-in said so), who can instead. The answer route checks again, whatever this shows.
 */
export function AnswerArea(props: {
  pending?: PendingQuestion;
  draft: string;
  onDraft: (draft: string) => void;
  onSend: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  /** The answer row's hint; "Answer" by default. */
  placeholder?: string;
}) {
  const { pending } = props;
  if (pending?.lookoutOnly && highRiskElsewhere()) return <p className="vf-intro">{HIGH_RISK_ELSEWHERE}</p>;
  return (
    <>
      <Suggestions options={pending?.suggestions} onPick={props.onSend} />
      <InputRow
        ref={props.inputRef}
        className="comms-input"
        value={props.draft}
        onValueChange={props.onDraft}
        onSubmit={props.onSend}
        disabled={!pending}
        placeholder={pending ? (props.placeholder ?? 'Answer') : ''}
      />
    </>
  );
}
