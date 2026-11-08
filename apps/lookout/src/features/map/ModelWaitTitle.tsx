import type { ModelTier } from '@teamtrail/core';

/** The sign's tooltip when it waits for a stronger model than any connected agent runs. */
export function ModelWaitTitle({ wait }: { wait?: ModelTier }) {
  if (!wait) return null;
  return <title>{`Needs a ${wait} model: no connected agent runs one`}</title>;
}
