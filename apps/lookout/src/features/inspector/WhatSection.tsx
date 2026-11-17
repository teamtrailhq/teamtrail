import { Clamp, DetailSection } from '../../components/ui';
import { CriteriaSummary } from '../criteria';
import { ticketDescription } from './ticketDescription';
import type { TicketView } from './useTicketView';

/** What the ticket asks: its description, cut to a few lines, and what "done" means (its acceptance criteria). */
export function WhatSection({ v }: { v: TicketView }) {
  const description = ticketDescription(v.t.body);
  const c = v.criteria;
  if (!description && !c.criteria.length && !c.proposal && !c.uncovered.length) return null;
  return (
    <DetailSection label="What" className="ticket-body">
      {description && <Clamp text={description} />}
      <CriteriaSummary c={c} />
    </DetailSection>
  );
}
