import { useState } from 'react';
import { Panel, Wordmark } from '../../components/ui';
import { ConfirmPair } from './ConfirmPair';
import { PairWays } from './PairWays';

/**
 * What a browser that isn't paired sees: with a sign-in link's code, one button to use it; otherwise how to get a
 * link, and a field for a code from Settings on the machine. Nothing of the trail shows until it is paired.
 */
export function PairPage(props: { local: boolean; code?: string }) {
  const [problem, setProblem] = useState<string>();
  const [code, setCode] = useState(props.code);
  const [shown, setShown] = useState(props.code);
  if (props.code !== shown) {
    setShown(props.code);
    setCode(props.code);
  }
  const fail = (error: string) => (setProblem(error), setCode(undefined));
  return (
    <div className="pair-page">
      <Panel as="main" className="pair-card">
        <div className="onb-brand">
          <Wordmark className="onb-title" />
        </div>
        <h1 className="t-heading pair-title">Pair this browser</h1>
        {problem && (
          <p className="pair-problem t-body" role="alert">
            {problem}
          </p>
        )}
        {code ? <ConfirmPair code={code} onFailed={fail} /> : <PairWays local={props.local} />}
      </Panel>
    </div>
  );
}
