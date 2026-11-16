import type { TrailDone } from '@teamtrail/core';
import { EmptyState } from '../../components/ui';
import { FlagShape } from '../map';

/** The Current trail step once the trail is done: the flag and the outcome, in place of the last step reported. */
export function TrailDoneStep({ done }: { done: Exclude<TrailDone, { kind: 'not-done' }> }) {
  const art = (
    <svg
      className={`destination reached ${done.kind}`}
      width="34"
      height="34"
      viewBox="-20 -21 40 42"
      aria-hidden="true"
    >
      <FlagShape />
    </svg>
  );
  return <EmptyState title="Destination reached" hint={done.reason} art={art} />;
}
