import type { SessionInfo } from '@teamtrail/core';
import { useCallback, useState } from 'react';
import { BubbleBody, MapBubble } from '../features/bubble';
import type { AnchorOf } from '../features/map';
import type { LookoutApi } from '../hooks';
import type { Selection } from '../lib';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';

const LABEL = { ticket: 'Ticket', main: 'Checks on main', together: 'Destination', question: 'Question' };

type Bubbled = Exclude<Selection, null | { kind: 'unspecified' }>;

/** What the bubble points at: the ticket's card, `main`, the destination, or nothing (a question about the trail). */
function anchorOf(sel: Bubbled) {
  if (sel.kind === 'ticket') return sel.id;
  if (sel.kind === 'main') return 'main';
  if (sel.kind === 'together') return 'destination';
  return undefined;
}

/**
 * The bubble on what's selected, wired to the app: its anchor on the map (or docked under it on a phone), red when
 * what it shows needs you now, and where its links lead (the full ticket, the conversation, Approvals, the brief).
 * Hidden while the full ticket is open.
 */
export function AppBubble(props: {
  api: LookoutApi;
  nav: ReturnType<typeof useAppNavigation>;
  attn: ReturnType<typeof useAttentionUi>;
  sessions: SessionInfo[];
  /** Checks on main need you: their bubble is red. */
  mainNeeds: boolean;
  place?: { anchorOf: AnchorOf; box: { w: number; h: number } };
}) {
  const { api, nav, attn } = props;
  const sel = api.selection;
  const [urgent, setUrgent] = useState(false);
  const onUrgent = useCallback((u: boolean) => setUrgent(u), []);
  if (!sel || sel.kind === 'unspecified' || nav.fullTicket) return null;
  // before there's a trail, only a question about one (a framing question) has a bubble
  if (!api.snap && sel.kind !== 'question') return null;
  const anchorId = anchorOf(sel);
  const red = sel.kind === 'main' ? props.mainNeeds : sel.kind === 'question' || urgent;
  // the trail's checks on main together say themselves when they need you (onUrgent)
  return (
    <MapBubble
      anchor={anchorId ? props.place?.anchorOf(anchorId) : undefined}
      box={props.place?.box ?? { w: 0, h: 0 }}
      docked={!props.place}
      urgent={red}
      label={LABEL[sel.kind]}
      onClose={() => nav.select(null)}
    >
      <BubbleBody
        selection={sel}
        snap={api.snap}
        api={api}
        sessions={props.sessions}
        attention={attn.attention.view}
        onUrgent={onUrgent}
        onFullTicket={() => nav.setFullTicket(true)}
        onOpenChat={(id) => nav.openChat(id)}
        onReviewChange={attn.handlers.openApprovals}
        onReviewBrief={attn.handlers.openBrief}
        onItem={attn.open}
        onDismiss={attn.attention.dismiss}
      />
    </MapBubble>
  );
}
