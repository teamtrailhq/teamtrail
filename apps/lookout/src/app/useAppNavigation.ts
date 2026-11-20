import { useEffect, useState } from 'react';
import type { LookoutApi } from '../hooks';
import type { Selection } from '../lib';
import type { Page } from './tabs';
import { useFullTicketRoute } from './useFullTicketRoute';
import { usePageRoute } from './usePageRoute';

/**
 * Where the trail lead is looking: the map with a bubble on what's selected (and the full ticket on request), or a
 * page over it (Plan, Activity, the Logbook), and the jumps between them. Opening a ticket, a question or checks on
 * main lands on the map with its bubble open; opening a conversation lands on Activity.
 */
export function useAppNavigation(api: LookoutApi) {
  const { activity, selection, setSelection, actions } = api;
  const route = usePageRoute();
  const full = useFullTicketRoute((id) => setSelection({ kind: 'ticket', id }));
  /** Hands-off has no map: a ticket opened anywhere opens as the full ticket (set from the mode by AppModeSwitch). */
  const [handsOff, setHandsOff] = useState(false);
  /** The decision the Logbook opens on. */
  const [logbookFocus, setLogbookFocus] = useState<string>();
  const [statsOpen, setStatsOpen] = useState(false);
  useEffect(() => {
    const s = activity.sessions.find((x) => x.id === api.chatSession);
    if (!selection && s?.ticketId && s.mapId === api.mapId) setSelection({ kind: 'ticket', id: s.ticketId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.chatSession, api.mapId]);
  // the trail changed under it (its selection cleared): the full ticket closes with its place in history
  useEffect(() => {
    if (full.open && selection?.kind !== 'ticket') full.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, full.open]);

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
    if (!s) full.close();
  };
  const onTrail = (mapId?: string) => {
    if (mapId && mapId !== api.mapId) actions.selectMap(mapId);
  };
  /** The full ticket on a ticket: in place of a page that was open (Back then returns where that page came from). */
  const openFullTicket = (mapId: string, ticketId: string) => {
    onTrail(mapId);
    setSelection({ kind: 'ticket', id: ticketId });
    setStatsOpen(false);
    const fromPage = !!route.page;
    route.dismiss();
    full.show(ticketId, fromPage);
  };
  const openTicket = (mapId: string, ticketId: string) => {
    if (handsOff) return openFullTicket(mapId, ticketId);
    onTrail(mapId);
    setSelection({ kind: 'ticket', id: ticketId });
    toMap();
  };
  /** Full ticket on what is selected; closing it goes back to where it was opened from. */
  const setFullTicket = (on: boolean) => {
    if (!on) return full.close();
    if (selection?.kind === 'ticket') full.show(selection.id);
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
  const openTrailChecks = (mapId: string) => {
    onTrail(mapId);
    setSelection({ kind: 'together' });
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
    fullTicket: full.open,
    setFullTicket,
    openFullTicket,
    /** Hands-off: tickets opened anywhere open as the full ticket, which stands in for a page (Back). */
    handsOff,
    setHandsOff,
    logbookFocus,
    openDecisions,
    statsOpen,
    setStatsOpen,
    toggleStats: () => setStatsOpen((o) => !o),
    select,
    openTicket,
    openQuestion,
    openMainChecks,
    openTrailChecks,
    openChat,
  };
}
