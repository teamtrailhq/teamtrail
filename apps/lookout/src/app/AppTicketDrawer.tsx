import type { SessionInfo, TrailDone } from '@teamtrail/core';
import { useEffect, useRef } from 'react';
import { Button, Panel } from '../components/ui';
import { Inspector } from '../features/inspector';
import type { LookoutApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';

/**
 * The full ticket, from the bubble's "Full ticket" or a ticket opened in Hands-off: the ticket inspector (every action,
 * comments, attempts, proof, guides, checks, editing) in a drawer over the map's right side, a page of its own on a
 * phone. × (Back in Hands-off, where it stands in for a page), Esc or the browser's Back closes it back to where it was
 * opened from, and focus returns to what opened it (the bubble, the row of Needs you).
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
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    // what opened it gets focus back when it closes, so Back lands on the row it came from
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && closeRef.current();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      if (from?.isConnected) from.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <Panel className={nav.handsOff ? 'ticket-drawer as-page' : 'ticket-drawer'} aria-label="Full ticket">
      {nav.handsOff ? (
        <div className="drawer-back">
          <Button size="sm" variant="ghost" onClick={close}>
            ← Back
          </Button>
        </div>
      ) : (
        <button type="button" className="bubble-close" aria-label="Close the full ticket" onClick={close}>
          ×
        </button>
      )}
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
        onDismiss={attn.attention.dismiss}
      />
    </Panel>
  );
}
