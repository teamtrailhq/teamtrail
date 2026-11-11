import { PairCodeForm } from './PairCodeForm';
import { PairHere } from './PairHere';

/** The two ways to pair, the likelier one first. */
export function PairWays(props: { local: boolean }) {
  return (
    <>
      <p className="t-body pair-step">The Lookout opens only in browsers you’ve paired.</p>
      {props.local ? <PairHere /> : <PairCodeForm />}
      {props.local ? <PairCodeForm /> : <PairHere />}
    </>
  );
}
