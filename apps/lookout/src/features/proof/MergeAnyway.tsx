import type { GapStanding } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { MergedNote } from './MergedNote';
import { ProofGapsLine } from './ProofGapsLine';
import { useMergeRequest } from './useMergeRequest';

/**
 * A done ticket whose proof isn't verified: Merge anyway, after one explicit question. Confirming records the trail
 * lead's decision, accepting exactly the gaps shown (the engine's `POST /proof/merge-anyway`), then asks the server to
 * merge at the commit the proof covers; the server checks it all again.
 */
export function MergeAnyway(props: {
  path: string;
  mapId: string;
  ticketId: string;
  gaps: string[];
  plan?: GapStanding[];
}) {
  const m = useMergeRequest(props);
  const { state } = m;
  if (state.kind === 'merged') return <MergedNote url={state.url} anyway />;
  if (state.kind === 'confirm')
    return (
      <div className="merge-confirm">
        <span className="t-meta">
          Merge without a verified proof? It is recorded as your decision, accepting what isn&apos;t verified.
        </span>
        <Button size="sm" onClick={() => void m.merge(props.gaps)}>
          Merge anyway
        </Button>
        <Button size="sm" variant="ghost" onClick={m.cancel}>
          Cancel
        </Button>
        <ProofGapsLine gaps={props.gaps} plan={props.plan} />
      </div>
    );
  return (
    <div className="merge-confirm">
      <Button size="sm" disabled={state.kind === 'working'} onClick={m.ask}>
        {state.kind === 'working' ? 'Merging…' : 'Merge anyway'}
      </Button>
      {state.kind === 'error' && <span className="t-meta">{state.text}</span>}
      <ProofGapsLine gaps={props.gaps} plan={props.plan} />
    </div>
  );
}
