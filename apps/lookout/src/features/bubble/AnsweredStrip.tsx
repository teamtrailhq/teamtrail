import { DoneStrip } from '../../components/ui';

/** An answer given in this bubble, kept to say so once the question has left. */
export interface Answered {
  text: string;
  agent: string;
}

/**
 * Where the question was, once you answered it here: a green strip with your answer, and that the agent has it. The
 * decision it backs is the agent's to record, so the strip names none.
 */
export function AnsweredStrip(props: { answered: Answered; ticketKey: string }) {
  const { answered } = props;
  return (
    <DoneStrip label={['Answered', props.ticketKey, 'you']} meta={`${answered.agent} has the answer`}>
      {answered.text}
    </DoneStrip>
  );
}
