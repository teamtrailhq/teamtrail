import type { TrailDone } from '@teamtrail/core';
import { EmptyState } from '../../components/ui';
import { DestinationMarkArt } from './DestinationMarkArt';

/** The Current trail step once the trail is done: the finish square and the outcome, in place of the last step reported. */
export function TrailDoneStep({ done }: { done: Exclude<TrailDone, { kind: 'not-done' }> }) {
  return (
    <EmptyState title="Destination reached" hint={done.reason} art={<DestinationMarkArt done={done} size={34} />} />
  );
}
