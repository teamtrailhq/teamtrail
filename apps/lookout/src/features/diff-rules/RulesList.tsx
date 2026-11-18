import type { DiffRule } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { sinceLabel } from '../../lib/sinceLabel';

/** The rules as approved, read-only: where they're seen but not set (another device). */
export function RulesList({ rules, lastMatched }: { rules: DiffRule[]; lastMatched: Record<string, number> }) {
  return (
    <ul className="dr-list">
      {rules.map((r) => (
        <Row
          as="li"
          key={r.id}
          title={<span className="t-code">{r.when.join(', ')}</span>}
          context={
            <MetaLine parts={[{ text: r.id, code: true }, r.check && `Runs ${r.check}`, r.ask && `Asks: ${r.ask}`]} />
          }
          detail={`Why: ${r.why}`}
          trailing={lastMatched[r.id] ? sinceLabel(lastMatched[r.id]) : 'Not matched yet'}
        />
      ))}
    </ul>
  );
}
