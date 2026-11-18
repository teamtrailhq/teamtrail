import { Clamp, DetailSection } from '../../components/ui';
import { ticketDescription } from './ticketDescription';
import type { TicketView } from './useTicketView';

/** What the ticket asks: its description, as the markdown an agent wrote it in, cut to a few lines. */
export function WhatSection({ v }: { v: TicketView }) {
  const description = ticketDescription(v.t.body);
  if (!description) return null;
  return (
    <DetailSection label="What" className="ticket-body">
      <Clamp text={description} markdown />
    </DetailSection>
  );
}
