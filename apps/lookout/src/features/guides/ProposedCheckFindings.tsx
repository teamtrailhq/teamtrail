import type { ProposedCheck } from '@teamtrail/core';
import { useCheckScreening } from '../../hooks/useCheckScreening';
import { CheckFindingList } from '../check-screening';

/** What reading the repo says about a check a guide proposes, before the trail lead approves it. Advice only. */
export function ProposedCheckFindings({ spec }: { spec: ProposedCheck }) {
  const findings = useCheckScreening([{ name: '0', run: spec.run, ...(spec.cwd ? { cwd: spec.cwd } : {}) }]);
  return <CheckFindingList findings={findings} />;
}
