import { useState } from 'react';
import { Panel, TeamtrailLogo, Wordmark } from '../../components/ui';
import { PairCodeForm } from './PairCodeForm';
import { PairHere } from './PairHere';
import { AMBIGUOUS_COOKIES, PAIR_REASONS } from './pairReasons';

/** Takes `?pair=<reason>` out of the address bar and returns it. */
function takeReason(): string | undefined {
  const q = new URLSearchParams(location.search);
  const reason = q.get('pair') ?? undefined;
  if (reason === undefined) return undefined;
  q.delete('pair');
  const rest = q.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}`);
  return PAIR_REASONS[reason];
}

/**
 * What a browser that isn't paired sees: how to get a link, and a field for a code from another device's
 * Settings. Nothing of the trail shows until it is paired.
 */
export function PairPage(props: { local: boolean; ambiguous: boolean }) {
  const [reason] = useState(takeReason);
  const problem = props.ambiguous ? AMBIGUOUS_COOKIES : reason;
  return (
    <div className="pair-page">
      <Panel as="main" className="pair-card">
        <div className="onb-brand">
          <TeamtrailLogo size={22} bare />
          <Wordmark className="onb-title" />
        </div>
        <h1 className="t-heading pair-title">Pair this browser</h1>
        {problem && (
          <p className="pair-problem t-body" role="alert">
            {problem}
          </p>
        )}
        <p className="t-body pair-step">The Lookout opens only in browsers you’ve paired.</p>
        {props.local ? <PairHere /> : <PairCodeForm />}
        {props.local ? <PairCodeForm /> : <PairHere />}
      </Panel>
    </div>
  );
}
