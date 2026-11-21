import type { decisionStats } from '@teamtrail/core';
import { LabelLine } from '../../components/ui';

/** `metrics.decisionStats` as one mono line: 14 active · 2 superseded · 5 last 24h · 64% by people. */
export function DecisionReadouts({ stats }: { stats: ReturnType<typeof decisionStats> }) {
  const people = stats.total ? Math.round((stats.human / stats.total) * 100) : 0;
  return (
    <LabelLine
      className="dv-readouts"
      parts={[
        `${stats.active} active`,
        !!stats.superseded && `${stats.superseded} superseded`,
        !!stats.last24h && `${stats.last24h} last 24h`,
        !!stats.total && `${people}% by people`,
      ]}
    />
  );
}
