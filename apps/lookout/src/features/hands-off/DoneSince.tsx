import { type Ticket, webUrl } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { usePrSync } from '../../hooks';
import { prSync } from '../../lib';
import type { ProofStatuses } from '../map';

/** Finished work: the ticket, whether its proof is verified and its pull request merged, and a link to the PR. */
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
  const merged = pr?.state === 'merged';
  return (
    <Row
      as="li"
      className="home-since-row"
      title={
        <>
          <span className={verified ? 'since-icon done' : 'since-icon'} aria-hidden="true">
            ✓
          </span>{' '}
          {t.key} {t.title}
        </>
      }
      context={<MetaLine parts={[verified ? 'verified' : 'done, not verified', merged && 'merged']} />}
      onOpen={() => props.onTicket(t.id)}
      actions={
        pr &&
        url && (
          <a className="link" href={url} target="_blank" rel="noreferrer">
            PR #{pr.number}
          </a>
        )
      }
    />
  );
}
