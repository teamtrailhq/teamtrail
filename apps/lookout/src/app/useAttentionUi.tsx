import { changeFocus, type AttentionItem } from '@teamtrail/core';
import {
  AttentionHeader,
  useAttention,
  useAttentionNotifications,
  type AttentionHandlers,
} from '../features/attention';
import type { KnowledgeStore } from '../features/knowledge';
import type { LookoutApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import { useItemLink } from './useItemLink';

/**
 * The attention queue, wired to the app: where each kind of item opens, the header's focus control and
 * interrupt count, and browser notifications. `openReroute` defaults to the item's ticket, else its trail;
 * the reroute review dialog takes it over when present.
 */
export function useAttentionUi(input: {
  api: LookoutApi;
  nav: ReturnType<typeof useAppNavigation>;
  knowledge: Pick<KnowledgeStore, 'setOpen'>;
  reviewBrief: () => void;
  openReroute?: (item: AttentionItem) => void;
  openGuides: () => void;
  /** Settings → Attention, where the quiet hours are set. */
  openFocusSettings: () => void;
}) {
  const { api, nav } = input;
  const attention = useAttention(api.allSnaps);
  useAttentionNotifications(attention.view);
  const selectTrail = (mapId: string) => mapId && api.actions.selectMap(mapId);
  const handlers: Omit<AttentionHandlers, 'openQuestion'> = {
    openTicket: nav.openTicket,
    openKnowledge: () => input.knowledge.setOpen(true),
    openBrief: (mapId) => (mapId === api.mapId ? input.reviewBrief() : selectTrail(mapId)),
    openReroute:
      input.openReroute ??
      ((item) => (item.ticketId ? nav.openTicket(item.mapId, item.ticketId) : selectTrail(item.mapId))),
    selectTrail,
    openGuides: input.openGuides,
  };
  const view = attention.view;
  const link = useItemLink({ loaded: api.loaded, view, activity: api.activity, handlers, showChat: nav.showChat });
  const header = view && (
    <AttentionHeader
      view={view}
      onFocus={(change) => void attention.savePrefs(changeFocus(view.prefs, change, Date.now()))}
      onSettings={input.openFocusSettings}
    />
  );
  return { attention, handlers, header, link };
}
