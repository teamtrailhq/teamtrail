import { changeFocus, type AttentionItem, type FocusChange } from '@teamtrail/core';
import {
  AttentionHeader,
  FocusPanel,
  openItem,
  useAttention,
  useAttentionNotifications,
  type AttentionHandlers,
} from '../features/attention';
import type { PhoneFocus } from '../features/header';
import type { KnowledgeStore } from '../features/knowledge';
import type { LookoutApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import { useItemLink } from './useItemLink';

/**
 * The attention queue, wired to the app: where each kind of item opens (a ticket, a question or checks on main in its
 * bubble; the brief, a reroute, approvals, guides and connectors in their own dialog or page), the header's focus
 * control, and browser notifications. `openReroute` defaults to the item's ticket, else its trail; the reroute review
 * dialog takes it over when present.
 */
export function useAttentionUi(input: {
  api: LookoutApi;
  nav: ReturnType<typeof useAppNavigation>;
  knowledge: Pick<KnowledgeStore, 'setOpen'>;
  reviewBrief: () => void;
  openReroute?: (item: AttentionItem) => void;
  openGuides: () => void;
  /** A connector's Settings section (Slack), for its delivery problems. */
  openConnector: (channel: string) => void;
  /** Settings → Approvals: what the repo asks this machine to trust. */
  openApprovals: () => void;
  /** Settings → Verification → Rules, prefilled with the rule an item suggests. */
  openRule: AttentionHandlers['openRule'];
  /** Settings → Attention, where the quiet hours are set. */
  openFocusSettings: () => void;
}) {
  const { api, nav } = input;
  const attention = useAttention(api.allSnaps);
  useAttentionNotifications(attention.view);
  const selectTrail = (mapId: string) => mapId && api.actions.selectMap(mapId);
  const handlers: AttentionHandlers = {
    openQuestion: nav.openQuestion,
    openTicket: nav.openTicket,
    openKnowledge: () => input.knowledge.setOpen(true),
    openBrief: (mapId) => (mapId === api.mapId ? input.reviewBrief() : selectTrail(mapId)),
    openReroute:
      input.openReroute ??
      ((item) => (item.ticketId ? nav.openTicket(item.mapId, item.ticketId) : selectTrail(item.mapId))),
    selectTrail,
    openGuides: input.openGuides,
    openConnector: input.openConnector,
    openApprovals: input.openApprovals,
    openMainChecks: nav.openMainChecks,
    openTrailChecks: nav.openTrailChecks,
    openRule: input.openRule,
  };
  const view = attention.view;
  const link = useItemLink({ loaded: api.loaded, view, activity: api.activity, handlers });
  const onFocus = (change: FocusChange) =>
    view && void attention.savePrefs(changeFocus(view.prefs, change, Date.now()));
  const header = view && <AttentionHeader view={view} onFocus={onFocus} onSettings={input.openFocusSettings} />;
  // On a phone, focus is the top of the header's More menu.
  const phoneFocus: PhoneFocus | undefined = view && {
    state: view.focus.kind,
    panel: (close) => <FocusPanel view={view} onChange={onFocus} onSettings={input.openFocusSettings} close={close} />,
  };
  return { attention, handlers, header, phoneFocus, link, open: (item: AttentionItem) => openItem(item, handlers) };
}
