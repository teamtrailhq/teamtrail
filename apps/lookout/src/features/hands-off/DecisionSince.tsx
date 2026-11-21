import type { AuditDecision, DecisionRecord } from '@teamtrail/core';
import { useState } from 'react';
import { Button, LabelLine, Row } from '../../components/ui';
import { hm } from '../../lib';
import { isKept, markKept } from '../../lib/keptDecisions';
import { OverruleForm } from '../decisions';

/**
 * A decision an agent made itself, within the risk policy: AGENT DECIDED, the ticket, who and at what risk, and when,
 * over what it decided and one line of why, with Keep and Overrule… on the right. Overrule opens a form under it: what
 * it should be instead, recorded as your decision replacing the agent's (both stay on record).
 */
export function DecisionSince(props: {
  d: DecisionRecord;
  audit?: AuditDecision;
  onSupersede: (d: AuditDecision, input: { answer: string; rationale?: string; alternatives?: string[] }) => void;
}) {
  const { d } = props;
  const key = `${d.mapId}/${d.id}`;
  const [overruling, setOverruling] = useState(false);
  const [kept, setKept] = useState(() => isKept(key));
  const replaced = !!props.audit?.supersededBy;
  const canOverrule = !!props.audit && !props.audit.postedBy && !replaced;
  const settled = kept || replaced;
  const keep = () => {
    markKept(key);
    setKept(true);
    setOverruling(false);
  };
  return (
    <Row
      as="li"
      className="home-since-row"
      label={
        <LabelLine
          parts={[
            { text: 'Agent decided', tone: 'agent' },
            d.ticketKey,
            d.decidedBy,
            d.risk && `${d.risk.level} risk`,
            hm(d.decidedAt),
            kept && !replaced && { text: 'kept by you', tone: 'ok' },
            replaced && { text: 'overruled', tone: 'dim' },
          ]}
        />
      }
      title={d.summary || d.answer}
      titleText={d.question}
      detail={d.rationale || undefined}
      detailText={d.rationale}
      action={
        !settled &&
        !overruling && (
          <>
            <Button onClick={keep}>Keep</Button>
            {canOverrule && <Button onClick={() => setOverruling(true)}>Overrule…</Button>}
          </>
        )
      }
      below={
        overruling &&
        props.audit && (
          <div className="home-review">
            <OverruleForm
              d={d}
              onCancel={() => setOverruling(false)}
              onOverrule={(input) => {
                props.onSupersede(props.audit!, input);
                setOverruling(false);
              }}
            />
          </div>
        )
      }
    />
  );
}
