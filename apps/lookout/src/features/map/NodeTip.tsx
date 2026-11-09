import type { ModelTier, SessionInfo } from '@teamtrail/core';

/**
 * The card's tooltip: why it waits when it needs a stronger model than any connected agent runs (model matching),
 * else the step the agent on it is at.
 */
export function NodeTip({ wait, session }: { wait?: ModelTier; session?: SessionInfo }) {
  if (wait) return <title>{`Needs a ${wait} model: no connected agent runs one`}</title>;
  if (!session) return null;
  return (
    <title>{`${session.agent} · step ${session.step}/${session.total} · ${session.stepLabel.toLowerCase()}`}</title>
  );
}
