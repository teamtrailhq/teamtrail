import type { AttentionView, MapSnapshot, SessionInfo } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { useNow, type LookoutApi } from '../../hooks';
import type { Selection } from '../../lib';
import { MainChecksSection } from '../main-checks';
import { QuestionNeed } from './QuestionNeed';
import { TicketBubble, type TicketBubbleLinks } from './TicketBubble';

/**
 * What the bubble shows for what's selected: a ticket (what it needs, then the ticket), checks on main (the three
 * ways on when they fail), or a question an agent asked about the trail as a whole.
 */
export function BubbleBody(
  props: TicketBubbleLinks & {
    selection: Exclude<Selection, null>;
    /** None yet for a framing question, asked before the trail exists. */
    snap?: MapSnapshot;
    api: LookoutApi;
    sessions: SessionInfo[];
    attention?: AttentionView;
    onUrgent: (urgent: boolean) => void;
  },
) {
  const { selection: sel, snap, api } = props;
  const now = useNow(5000);
  switch (sel.kind) {
    case 'ticket': {
      const t = snap?.tickets.find((x) => x.id === sel.id);
      if (!t) return <Empty>Ticket not found.</Empty>;
      return <TicketBubble key={t.id} {...props} snap={snap!} t={t} />;
    }
    case 'main':
      return snap ? <MainChecksSection mapId={snap.map.id} now={now} /> : null;
    case 'question': {
      const q = api.activity.pending.find((p) => p.id === sel.id);
      if (!q) return <Empty>Answered.</Empty>;
      const keyOf = (id: string) => snap?.tickets.find((x) => x.id === id)?.key;
      return <QuestionNeed q={q} now={now} keyOf={keyOf} onAnswer={api.actions.answer} onOpenChat={props.onOpenChat} />;
    }
    case 'unspecified':
      return null;
    default: {
      const never: never = sel;
      return never;
    }
  }
}
