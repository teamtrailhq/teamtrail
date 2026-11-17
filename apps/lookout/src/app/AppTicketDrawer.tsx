import type { SessionInfo, TrailDone } from '@teamtrail/core';
import { useEffect } from 'react';
import { Panel } from '../components/ui';
import { Inspector } from '../features/inspector';
import type { LookoutApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';

/**
 * The full ticket, from the bubble's "Full ticket": the ticket inspector (every action, comments, attempts, proof,
 * guides, checks, editing) in a drawer over the map's right side, a page of its own on a phone. × or Esc closes it
 * back to the bubble.
 */
export function AppTicketDrawer(props: {
  api: LookoutApi;
  nav: ReturnType<typeof useAppNavigation>;
  attn: ReturnType<typeof useAttentionUi>;
  sessions: SessionInfo[];
  done?: TrailDone;
}) {
  const { api, nav, attn } = props;
  const open = nav.fullTicket && api.selection?.kind === 'ticket';
  const close = () => nav.setFullTicket(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && nav.setFullTicket(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, nav]);
  if (!open) return null;
  return (
    <Panel className="ticket-drawer" aria-label="Full ticket">
      <button type="button" className="bubble-close" aria-label="Close the full ticket" onClick={close}>
        ×
      </button>
      <Inspector
        api={api}
        sessions={props.sessions}
        bare
        attention={attn.attention.view}
        done={props.done}
        onOpenChat={(id) => nav.openChat(id)}
        onOpenDecision={nav.openDecisions}
        onItem={(item) => attn.open(item)}
        onReviewChange={attn.handlers.openApprovals}
        onReviewBrief={attn.handlers.openBrief}
      />
    </Panel>
  );
}
