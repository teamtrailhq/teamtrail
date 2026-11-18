import type { SessionInfo, TrailDone } from '@teamtrail/core';
import { Inspector } from '../features/inspector';
import type { LookoutApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';

/**
 * The Trail step zone, wired to the app: conversations and decisions open where the layout shows them, a queue item
 * opens as its inbox row would, a ticket's outside change opens Approvals and a held ticket's brief opens its review.
 */
export function AppInspector(props: {
  api: LookoutApi;
  sessions: SessionInfo[];
  bare: boolean;
  nav: ReturnType<typeof useAppNavigation>;
  attn: ReturnType<typeof useAttentionUi>;
  done?: TrailDone;
}) {
  const { nav, attn } = props;
  return (
    <Inspector
      api={props.api}
      sessions={props.sessions}
      bare={props.bare}
      attention={attn.attention.view}
      done={props.done}
      onOpenChat={(id) => nav.openChat(id)}
      onOpenDecision={nav.openDecisions}
      onItem={(item) => attn.link.request(item.id)}
      onReviewChange={attn.handlers.openApprovals}
      onReviewBrief={attn.handlers.openBrief}
      onDismiss={attn.attention.dismiss}
    />
  );
}
