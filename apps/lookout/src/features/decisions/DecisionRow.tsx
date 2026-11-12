import { type AuditDecision, decisionStatus, DECISION_SOURCES, postedNote } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { actorLabel, day, hm } from '../../lib';
import { useSlackPeople } from '../slack';

/** Where the decision stands in a supersession chain, when it's part of one. */
function chainNote(d: AuditDecision) {
  if (decisionStatus(d) === 'superseded') return `Replaced by ${d.supersededBy}`;
  if (d.supersedes) return `Replaces ${d.supersedes}`;
  return undefined;
}

/** One decision: the question, then who decided it where, then the answer. */
export function DecisionRow(props: {
  d: AuditDecision;
  newDay: boolean;
  trail?: string;
  on: boolean;
  showTrail: boolean;
  onClick: () => void;
}) {
  const { d } = props;
  const people = useSlackPeople();
  const status = decisionStatus(d);
  return (
    <>
      {props.newDay && <li className="dv-day t-label">{day(d.decidedAt)}</li>}
      <Row
        as="li"
        className={`dv-row ${status}`}
        selected={props.on}
        onOpen={props.onClick}
        title={d.question}
        titleText={d.question}
        trailing={hm(d.decidedAt)}
        context={
          <MetaLine
            parts={[
              { text: d.id, code: true },
              d.ticketKey && { text: d.ticketKey, code: true },
              props.showTrail && props.trail,
              actorLabel(d.decidedBy, people),
              postedNote(d) ?? DECISION_SOURCES[d.source.kind].label,
              chainNote(d),
            ]}
          />
        }
        detail={d.summary}
        detailText={d.summary}
      />
    </>
  );
}
