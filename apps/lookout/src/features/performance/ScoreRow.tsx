import { durationLabel, type ScorecardRow } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n?: number) => (n === undefined ? undefined : `$${n.toFixed(2)} per verified`);

/** One scorecard group: first-time rate when there are enough tickets, then the counts and cost behind it. */
export function ScoreRow({ r, minSample }: { r: ScorecardRow; minSample: number }) {
  return (
    <Row
      as="li"
      className="perf-row score-row"
      title={r.key}
      trailing={
        r.enough ? (
          <span title="Verified on the first attempt">{pct(r.firstTimeRate)} first time</span>
        ) : (
          <span className="t-meta" title={`Compared from ${minSample} tickets`}>
            too few
          </span>
        )
      }
      context={
        <MetaLine
          parts={[
            `${r.verified} of ${r.tickets} verified`,
            `${pct(r.reworkRate)} rework`,
            r.attemptsPerVerified !== undefined && `${r.attemptsPerVerified} attempts each`,
            usd(r.costPerVerifiedUsd),
            r.medianLeadMs !== undefined && durationLabel(r.medianLeadMs),
          ]}
        />
      }
      detail={
        r.findings.error + r.findings.warn > 0
          ? `Review findings: ${r.findings.error} errors, ${r.findings.warn} warnings`
          : undefined
      }
    />
  );
}
