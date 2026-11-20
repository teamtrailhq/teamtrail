import type { GapStanding } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import type { MergeOffer } from './mergeOffer';
import { MergedNote } from './MergedNote';
import { ProofGapsLine } from './ProofGapsLine';
import { useMergeRequest } from './useMergeRequest';

const ASK = {
  approve: 'Merge its pull request, at exactly the commit Teamtrail verified?',
  anyway: "Merge without a verified proof? It is recorded as your decision, accepting what isn't verified.",
};

/**
 * The one question before a merge, opened by the ticket's merge action (mergeAction.ts) in its bubble, the full
 * ticket and a row of Needs you alike. Merge anyway records the trail lead's acceptance of exactly the gaps shown
 * first (the engine's `POST /proof/merge-anyway`), then asks the server to merge; the server checks it all again. The
 * offer is kept as it was opened, so what happened still reads once the merged pull request takes the action away.
 */
export function MergeForm(props: {
  offer?: MergeOffer;
  mapId: string;
  ticketId: string;
  plan?: GapStanding[];
  onClose: () => void;
}) {
  const [offer] = useState(props.offer);
  const m = useMergeRequest({ path: offer?.path ?? '', mapId: props.mapId, ticketId: props.ticketId });
  if (!offer) return null;
  const anyway = offer.kind === 'anyway';
  if (m.state.kind === 'merged') return <MergedNote url={m.state.url} anyway={anyway} />;
  const working = m.state.kind === 'working';
  return (
    <div className="merge-confirm merge-form">
      <span className="t-meta">{ASK[offer.kind]}</span>
      <Button
        size="sm"
        variant="primary"
        disabled={working}
        onClick={() => void m.merge(anyway ? offer.gaps : undefined)}
      >
        {working ? 'Merging…' : anyway ? 'Merge anyway' : 'Merge'}
      </Button>
      <Button size="sm" variant="ghost" disabled={working} onClick={props.onClose}>
        Cancel
      </Button>
      {m.state.kind === 'error' && <span className="t-meta merge-error">{m.state.text}</span>}
      {anyway && <ProofGapsLine gaps={offer.gaps} plan={props.plan} />}
    </div>
  );
}
