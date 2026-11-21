import type { ActivityState } from '@teamtrail/core';

type Session = ActivityState['sessions'][number];

/** Model matching: the session's tier at the end of its lane's label line, the model it was read from on hover. */
export function SessionTier({ s }: { s: Session }) {
  const tip = s.model ? `Runs ${s.model}` : 'No model reported, so it counts as balanced';
  return (
    <>
      <span className="ds-label-sep"> · </span>
      <span className="session-tier" title={tip}>
        {s.tier ?? 'balanced'}
      </span>
    </>
  );
}
