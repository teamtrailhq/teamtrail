import type { AttentionItem } from '@teamtrail/core';

/** Where each kind of queue item opens. Built by the app (app/useAttentionUi.ts) and the inbox (questions). */
export interface AttentionHandlers {
  openQuestion: (questionId: string) => void;
  openTicket: (mapId: string, ticketId: string) => void;
  openKnowledge: () => void;
  openBrief: (mapId: string) => void;
  /** Reroute proposals and suggestions: the reroute review, once wired; selecting the trail until then. */
  openReroute: (item: AttentionItem) => void;
  selectTrail: (mapId: string) => void;
  /** Guides and the checks they propose: Settings → Guides. */
  openGuides: () => void;
  /** A connector whose messages are refused (`slack`): its Settings section. */
  openConnector: (channel: string) => void;
}

function openTicketOrTrail(item: AttentionItem, h: AttentionHandlers) {
  if (item.ticketId) h.openTicket(item.mapId, item.ticketId);
  else h.selectTrail(item.mapId);
}

/** Opens the place where the human handles the item. Every kind is listed, so a new kind fails to compile here. */
export function openItem(item: AttentionItem, h: AttentionHandlers) {
  switch (item.kind) {
    case 'question':
      return h.openQuestion(item.ref);
    case 'approval':
    case 'blocked':
    case 'policy':
    case 'flag':
    case 'stalled':
    case 'hitl-ready':
    case 'overlap':
    case 'integration':
    case 'model':
      return openTicketOrTrail(item, h);
    case 'knowledge':
      return h.openKnowledge();
    case 'brief':
      return h.openBrief(item.mapId);
    case 'reroute':
    case 'reroute-suggested':
      return h.openReroute(item);
    case 'guide':
    case 'guide-checks':
      return h.openGuides();
    case 'delivery':
      return h.openConnector(item.ref);
    default: {
      const never: never = item.kind;
      return never;
    }
  }
}
