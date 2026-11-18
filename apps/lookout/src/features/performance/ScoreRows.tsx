import type { ScorecardRow } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { ScoreRow } from './ScoreRow';

/** One scorecard grouping's rows, or what fills it once agents finish verified tickets. */
export function ScoreRows({ rows, minSample }: { rows: ScorecardRow[]; minSample: number }) {
  if (!rows.length) return <Empty>No completions yet. The scorecard fills in as agents finish verified tickets.</Empty>;
  return (
    <ul className="perf-rows">
      {rows.map((r) => (
        <ScoreRow key={r.key} r={r} minSample={minSample} />
      ))}
    </ul>
  );
}
