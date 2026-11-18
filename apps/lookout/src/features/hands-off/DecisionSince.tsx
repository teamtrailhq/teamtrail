import type { AuditDecision, DecisionRecord } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine, Row } from '../../components/ui';
import { isKept, markKept } from '../../lib/keptDecisions';
import { DecisionReview } from './DecisionReview';

/**
 * A decision an agent made itself, within the risk policy: what it decided, who and at what risk, and Review: the
 * agent's reasons and alternatives, then Keep it, or Overrule with a new decision of yours.
 */
export function DecisionSince(props: {
  d: DecisionRecord;
  audit?: AuditDecision;
  onSupersede: (d: AuditDecision, input: { answer: string; rationale?: string; alternatives?: string[] }) => void;
}) {
  const { d } = props;
  const key = `${d.mapId}/${d.id}`;
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(() => isKept(key));
  const replaced = !!props.audit?.supersededBy;
  return (
    <Row
      as="li"
      className="home-since-row"
      title={
        <>
          <span className="since-icon decided" aria-hidden="true">
            ◆
          </span>{' '}
          {d.summary || d.answer}
        </>
      }
      titleText={d.question}
      context={
        <MetaLine
          parts={[
            `${d.decidedBy} decided`,
            d.risk && `${d.risk.level} risk`,
            kept && 'you kept it',
            replaced && 'overruled',
          ]}
        />
      }
      onOpen={() => setOpen(!open)}
      actions={
        <Button size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Review'}
        </Button>
      }
      below={
        open && (
          <DecisionReview
            d={d}
            audit={replaced ? undefined : props.audit}
            onKeep={() => {
              markKept(key);
              setKept(true);
              setOpen(false);
            }}
            onOverrule={(input) => {
              if (props.audit) props.onSupersede(props.audit, input);
              setOpen(false);
            }}
          />
        )
      }
    />
  );
}
