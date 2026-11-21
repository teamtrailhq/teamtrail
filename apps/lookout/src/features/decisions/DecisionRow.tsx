import { type AuditDecision, decisionStatus, postedNote } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Button, LabelLine, Row } from '../../components/ui';
import { day, deciderLabel, hm } from '../../lib';
import { useSlackPeople } from '../slack';
import { decisionLabel } from './decisionLabel';

/** One line of why: the rationale's first line, else the question it answers. */
function whyOf(d: AuditDecision) {
  const why = d.rationale.split('\n').find((l) => l.trim());
  return why?.trim() || d.question;
}

/**
 * One decision in the ledger: its label line (D-n · #ticket · who · risk · time), the call as the headline and one
 * line of why. A superseded call is struck through, with the decision that replaced it as the row's action.
 */
export function DecisionRow(props: {
  d: AuditDecision;
  newDay: boolean;
  /** By area: the group heading shown above its first row, instead of the day. */
  group?: string;
  /** How many later decisions cite this one. */
  cited?: number;
  trail?: string;
  on: boolean;
  showTrail: boolean;
  kept?: boolean;
  /** The row's own action (Keep / Overrule… while it waits for review); a superseded row links its replacement. */
  action?: ReactNode;
  below?: ReactNode;
  className?: string;
  onClick: () => void;
  onSelect?: (id: string) => void;
}) {
  const { d } = props;
  const people = useSlackPeople();
  const status = decisionStatus(d);
  const who = [deciderLabel(d, people), postedNote(d)].filter(Boolean).join(' ');
  const label = decisionLabel({
    d,
    who,
    trail: props.showTrail ? props.trail : undefined,
    time: props.group ? `${day(d.decidedAt)} ${hm(d.decidedAt)}` : hm(d.decidedAt),
    kept: props.kept,
    cited: props.cited,
  });
  const replacedBy = status === 'superseded' && d.supersededBy;
  const action =
    props.action ??
    (replacedBy && props.onSelect && (
      <Button size="sm" variant="ghost" onClick={() => props.onSelect!(replacedBy)} title={`Replaced by ${replacedBy}`}>
        → {replacedBy}
      </Button>
    ));
  return (
    <>
      {props.newDay && <li className="dv-day t-label">{props.group ?? day(d.decidedAt)}</li>}
      <Row
        as="li"
        className={['dv-row', status, d.derived && 'unverified', props.className].filter(Boolean).join(' ')}
        selected={props.on}
        onOpen={props.onClick}
        label={<LabelLine parts={label} />}
        title={d.summary || d.answer}
        titleText={d.question}
        detail={whyOf(d)}
        detailText={whyOf(d)}
        action={action || undefined}
        below={props.below}
      />
    </>
  );
}
