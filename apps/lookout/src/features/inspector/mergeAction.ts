import type { MenuItem } from '../../components/ui';
import type { MergeOffer } from '../proof';
import type { TicketRunners } from './types';

/**
 * Merging a done ticket's pull request, where a server merges them (`v.merge`, proof/mergeOffer.ts): Approve and
 * merge when its proof is verified, Merge anyway… when not. Either opens its one question under the bar (MergeForm).
 * The bar takes it as the done ticket's primary action, and as the `merge` queue item's.
 */
export function mergeAction(merge: MergeOffer | undefined, run: Pick<TicketRunners, 'form'>): MenuItem | undefined {
  if (!merge) return undefined;
  const onSelect = () => run.form('merge');
  if (merge.kind === 'approve')
    return {
      id: 'merge',
      label: 'Approve and merge',
      tip: 'Merge its pull request at exactly the commit Teamtrail verified',
      onSelect,
    };
  return {
    id: 'merge',
    label: 'Merge anyway…',
    tip: `Not verified: ${merge.gaps[0] ?? 'no passing completion.'} Merging records that you accept it.`,
    onSelect,
  };
}
