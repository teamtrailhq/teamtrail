import type { Assumption, MapSnapshot } from '@teamtrail/core';
import { Button, LabelLine, Row } from '../../components/ui';
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
 * One assumption as a status line: `S-2 · CHALLENGED · BY CODEX-01 · RELIED ON BY #5 #12` (each key opens its ticket),
 * the assumption as the title, and a challenge's evidence under it. Confirm stays on the right while it's challenged,
 * and shows on hover or focus while it holds. Challenged is amber, never rose: its Waits on you row does the asking.
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
  const confirm = props.onConfirm && (
    <Button
      size="sm"
      variant={a.status === 'challenged' ? 'default' : 'ghost'}
      disabled={props.busy}
      onClick={props.onConfirm}
    >
      Confirm
    </Button>
  );
  return (
    <Row
      as="li"
      className={`assumption st-${a.status}`}
      edge={a.status === 'challenged' ? 'attention' : 'neutral'}
      label={
        <LabelLine
          parts={[a.id, { text: STATUS[a.status], tone: a.status === 'confirmed' ? 'ok' : 'dim' }, settledBy(a)]}
        >
          {tickets.length > 0 && (
            <span className="assumption-tickets">
              <span className="ds-label-sep"> · </span>relied on by
              {tickets.map((t) => (
                <button key={t.id} className="link" onClick={() => props.onSelect({ kind: 'ticket', id: t.id })}>
                  {t.key}
                </button>
              ))}
            </span>
          )}
        </LabelLine>
      }
      title={a.text}
      titleText={a.text}
      detail={challenge}
      detailText={challenge}
      action={a.status === 'challenged' ? confirm : undefined}
      actions={a.status === 'challenged' ? undefined : confirm}
    />
  );
}
