import type { EscapeCheckRow } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One check: how much of the verified work it passed came back anyway. */
export function CheckEscapeRow({ r, minSample }: { r: EscapeCheckRow; minSample: number }) {
  return (
    <Row
      as="li"
      className="perf-row score-row"
      title={r.key}
      trailing={
        r.enough ? (
          <span title="Verified work it passed that was reopened or reverted">{pct(r.escapeRate)} came back</span>
        ) : (
          <span className="t-meta" title={`Compared from ${minSample} verified tickets`}>
            too few
          </span>
        )
      }
      context={<MetaLine parts={[`passed ${r.verified} verified`, `${r.escaped} came back`]} />}
    />
  );
}
