import { type Ticket, webUrl } from '@teamtrail/core';
import { LabelLine, Row } from '../../components/ui';
import { usePrSync } from '../../hooks';
import { prSync } from '../../lib';
import type { ProofStatuses } from '../map';

/**
 * Finished work: VERIFIED in green (or done, not verified), the ticket and its pull request merged or not in the
 * label line, the ticket's title, and Pull request on the right.
 */
export function DoneSince(props: {
  mapId: string;
  ticket: Ticket;
  proofs?: ProofStatuses;
  onTicket: (ticketId: string) => void;
}) {
  const { ticket: t } = props;
  const pr = prSync.ticket(usePrSync(), props.mapId, t.id)?.pr;
  const url = pr && webUrl(pr.url);
  const verified = props.proofs?.[t.id] === 'verified';
  const prPart = pr && `PR #${pr.number}${pr.state === 'merged' ? ' merged' : ''}`;
  return (
    <Row
      as="li"
      className="home-since-row"
      label={
        <LabelLine
          className="home-done-label"
          parts={[verified ? { text: 'Verified', tone: 'ok' } : 'Done, not verified', t.key, prPart]}
        />
      }
      title={t.title}
      onOpen={() => props.onTicket(t.id)}
      action={
        url && (
          <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
            Pull request
          </a>
        )
      }
    />
  );
}
