import { useState } from 'react';
import { ChangedNotice } from '../../components/ui';
import { useShown } from '../../hooks/useShown';
import { CriteriaProposal } from './CriteriaProposal';
import type { CriteriaProposalView } from './useCriteriaProposals';

/**
 * An agent's proposed criteria, taken only as the trail lead opened them: a proposal replaced while they read waits
 * for "Review again", and a refused take says why.
 */
export function ProposedCriteria(props: {
  proposal: CriteriaProposalView;
  decide: (action: 'accept' | 'dismiss', hash?: string) => Promise<string | undefined>;
}) {
  const { proposal } = props;
  const shown = useShown(`${proposal.ticketId}@${proposal.at}`, proposal.hash);
  const [error, setError] = useState<string>();
  const decide = (action: 'accept' | 'dismiss') => void props.decide(action, shown.hash).then(setError);
  return (
    <>
      {shown.changed && <ChangedNotice what="The proposal" onReviewAgain={shown.reviewAgain} />}
      <CriteriaProposal
        proposal={proposal}
        canAccept={!shown.changed}
        onAccept={() => decide('accept')}
        onDismiss={() => decide('dismiss')}
      />
      {error && <p className="vf-err">{error}</p>}
    </>
  );
}
