import { useEffect, useState } from 'react';
import type { LookoutApi } from '../hooks';
import type { Selection } from '../lib';
import type { Page } from './tabs';
import { usePageRoute } from './usePageRoute';

/**
 * Where the trail lead is looking: the map with a bubble on what's selected (and the full ticket on request), or a
 * page over it (Plan, Activity, the Logbook), and the jumps between them. Opening a ticket, a question or checks on
 * main lands on the map with its bubble open; opening a conversation lands on Activity.
 */
export function useAppNavigation(api: LookoutApi) {
  const { activity, selection, setSelection, actions } = api;
  const route = usePageRoute();
  const [fullTicket, setFullTicket] = useState(false);
  /** The decision the Logbook opens on. */
  const [logbookFocus, setLogbookFocus] = useState<string>();
  const [statsOpen, setStatsOpen] = useState(false);
  useEffect(() => {
    const s = activity.sessions.find((x) => x.id === api.chatSession);
    if (!selection && s?.ticketId && s.mapId === api.mapId) setSelection({ kind: 'ticket', id: s.ticketId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.chatSession, api.mapId]);

  const toMap = () => {
    setStatsOpen(false);
    route.close();
  };
  const openPage = (page: Page) => {
    setStatsOpen(false);
    route.open(page);
  };
  /** Selecting on the map, the trail bar or a list opens its bubble; nothing selected closes it and the full ticket. */
  const select = (s: Selection) => {
    setSelection(s);
    if (!s) setFullTicket(false);
  };
  const onTrail = (mapId?: string) => {
    if (mapId && mapId !== api.mapId) actions.selectMap(mapId);
  };
  const openTicket = (mapId: string, ticketId: string) => {
    onTrail(mapId);
    setSelection({ kind: 'ticket', id: ticketId });
    toMap();
  };
  const openQuestion = (questionId: string) => {
    const q = activity.pending.find((p) => p.id === questionId);
    if (!q) return;
    onTrail(q.mapId);
    setSelection(q.ticketId ? { kind: 'ticket', id: q.ticketId } : { kind: 'question', id: q.id });
    toMap();
  };
  const openMainChecks = (mapId: string) => {
    onTrail(mapId);
    setSelection({ kind: 'main' });
    toMap();
  };
  const openChat = (sessionId: string, _ticketId?: string, mapId?: string) => {
    onTrail(mapId);
    actions.openChat(sessionId);
    openPage('activity');
  };
  const openDecisions = (focus?: string) => {
    setLogbookFocus(focus);
    openPage('logbook');
  };

  return {
    page: route.page,
    openPage,
    toMap,
    fullTicket,
    setFullTicket,
    logbookFocus,
    openDecisions,
    statsOpen,
    setStatsOpen,
    toggleStats: () => setStatsOpen((o) => !o),
    select,
    openTicket,
    openQuestion,
    openMainChecks,
    openChat,
  };
}
