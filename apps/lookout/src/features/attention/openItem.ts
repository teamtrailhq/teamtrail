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
  /** What the repo's files ask this machine to trust: Settings → Approvals. */
  openApprovals: () => void;
  /** Checks failing on main: their bubble at the start of the trail. */
  openMainChecks: (mapId: string) => void;
}

function openTicketOrTrail(item: AttentionItem, h: AttentionHandlers) {
  if (item.ticketId) h.openTicket(item.mapId, item.ticketId);
  else h.selectTrail(item.mapId);
}

/** Kinds about one ticket (or a trail): their row opens it. */
const TICKET_KINDS = new Set<AttentionItem['kind']>([
  'approval',
  'blocked',
  'policy',
  'precedent',
  'flag',
  'stalled',
  'hitl-ready',
  'overlap',
  'integration',
  'model',
  'tracker-settings',
]);

/** Opens the place where the human handles the item: the ticket for ticket kinds, else its own view. */
export function openItem(item: AttentionItem, h: AttentionHandlers) {
  if (TICKET_KINDS.has(item.kind)) return openTicketOrTrail(item, h);
  switch (item.kind) {
    case 'question':
      return h.openQuestion(item.ref);
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
    case 'trust':
      return h.openApprovals();
    case 'main-checks':
      return h.openMainChecks(item.mapId);
    default:
      return openTicketOrTrail(item, h);
  }
}
