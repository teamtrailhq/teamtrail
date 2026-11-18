import { type AttentionItem, type AttentionView, type MapSnapshot, type SessionInfo } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { type LookoutApi } from '../../hooks';
import { TicketPanel } from './TicketPanel';
import type { Form } from './types';

/** The ticket selected on the map, or a note that it's gone. */
export function TicketDetail(props: {
  snap: MapSnapshot;
  id: string;
  api: LookoutApi;
  sessions: SessionInfo[];
  attention?: AttentionView;
  form: Form;
  setForm: (f: Form) => void;
  onOpenChat: (id: string) => void;
  onOpenDecision?: (id: string) => void;
  onReviewChange?: () => void;
  onReviewBrief?: (mapId: string) => void;
  onItem?: (item: AttentionItem) => void;
  onDismiss?: (id: string) => void;
}) {
  const t = props.snap.tickets.find((x) => x.id === props.id);
  if (!t) return <Empty>Ticket not found.</Empty>;
  return <TicketPanel key={t.id} {...props} t={t} />;
}
