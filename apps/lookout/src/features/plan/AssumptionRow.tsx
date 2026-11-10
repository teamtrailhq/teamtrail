import type { Assumption, MapSnapshot } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import type { Selection } from '../../lib';

const STATUS: Record<Assumption['status'], string> = {
  holding: 'Holding',
  challenged: 'Challenged',
  invalidated: 'Invalidated',
  confirmed: 'Confirmed',
};

/** Who settled an assumption, in plain words: a reroute invalidated it, or the trail lead confirmed it. */
function settledBy(a: Assumption) {
  if (!a.decidedBy) return undefined;
  if (a.status === 'invalidated') return `invalidated by ${a.decidedBy}`;
  if (a.status === 'confirmed') return `confirmed by ${a.decidedBy === 'trail lead' ? 'you' : a.decidedBy}`;
  return `kept by ${a.decidedBy}`;
}

/**
 * One assumption as a row: the assumption as the title; its id, status and who settled it, then the tickets that rely
 * on it, as context; the challenge evidence as detail. Amber while challenged. Confirm shows on hover or focus,
 * like every row action, so the row reads like the plan's other lists.
 */
export function AssumptionRow(props: {
  a: Assumption;
  snap: MapSnapshot;
  onSelect: (s: Selection) => void;
  onConfirm?: () => void;
  busy?: boolean;
}) {
  const { a, snap } = props;
  const tickets = a.tickets.flatMap((id) => snap.tickets.filter((t) => t.id === id));
  const challenge = a.challenge && `${a.challenge.by}: ${a.challenge.evidence}`;
  return (
    <Row
      as="li"
      className={`assumption st-${a.status}`}
      edge={a.status === 'challenged' ? 'attention' : 'neutral'}
      title={a.text}
      titleText={a.text}
      context={
        <MetaLine parts={[{ text: a.id, code: true }, STATUS[a.status], settledBy(a)]}>
          {tickets.length > 0 && (
            <span className="assumption-tickets">
              <span className="sep"> · </span>relied on by
              {tickets.map((t) => (
                <button key={t.id} className="link t-code" onClick={() => props.onSelect({ kind: 'ticket', id: t.id })}>
                  {t.key}
                </button>
              ))}
            </span>
          )}
        </MetaLine>
      }
      detail={challenge}
      detailText={challenge}
      actions={
        props.onConfirm && (
          <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onConfirm}>
            Confirm
          </Button>
        )
      }
    />
  );
}
