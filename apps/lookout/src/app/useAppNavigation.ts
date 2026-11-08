import { useEffect, useState } from 'react';
import type { Breakpoint, LookoutApi } from '../hooks';
import type { Selection } from '../lib';
import type { PhoneTab, SideTab } from './tabs';

/**
 * Where the trail lead is looking: the laptop side tab, the phone tab, the decisions view, and the jumps between
 * them. Opening a ticket or a conversation lands on whichever layer shows it at the current breakpoint.
 */
export function useAppNavigation(api: LookoutApi, bp: Breakpoint) {
  const { activity, selection, setSelection, actions } = api;
  const [sideTab, setSideTab] = useState<SideTab>('ticket');
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('home');
  const [convRequest, setConvRequest] = useState(0);
  /** Decisions view: closed, or open with an optional record to focus. */
  const [decisionsView, setDecisionsView] = useState<{ focus?: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const openDecisions = (focus?: string) => {
    setStatsOpen(false);
    setDecisionsView({ focus });
  };
  const toggleStats = () => {
    setDecisionsView(null);
    setStatsOpen((o) => !o);
  };
  useEffect(() => {
    const s = activity.sessions.find((x) => x.id === api.chatSession);
    if (!selection && s?.ticketId && s.mapId === api.mapId) setSelection({ kind: 'ticket', id: s.ticketId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.chatSession, api.mapId]);

  /** Selecting from the map or a list shows the ticket wherever the ticket layer lives. */
  const select = (s: Selection) => {
    setSelection(s);
    if (!s) return;
    if (bp === 'laptop') setSideTab('ticket');
    if (bp === 'mobile') setPhoneTab('ticket');
  };
  const openChat = (sessionId: string, ticketId?: string, mapId?: string) => {
    if (mapId && mapId !== api.mapId) actions.selectMap(mapId);
    actions.openChat(sessionId);
    const s = activity.sessions.find((x) => x.id === sessionId);
    if (ticketId && s?.mapId === (mapId ?? api.mapId)) setSelection({ kind: 'ticket', id: ticketId });
    if (bp === 'mobile') {
      setPhoneTab('home');
      setConvRequest((n) => n + 1);
    }
  };
  /** Opens a conversation and shows it, on every layout (a deep link to a question). */
  const showChat = (sessionId: string, ticketId?: string, mapId?: string) => {
    openChat(sessionId, ticketId, mapId);
    setConvRequest((n) => n + 1);
  };
  const openTicket = (mapId: string, ticketId: string) => {
    if (mapId !== api.mapId) actions.selectMap(mapId);
    setSelection({ kind: 'ticket', id: ticketId });
    setDecisionsView(null);
    if (bp === 'laptop') setSideTab('ticket');
    if (bp === 'mobile') setPhoneTab('ticket');
  };

  return {
    sideTab,
    setSideTab,
    phoneTab,
    setPhoneTab,
    convRequest,
    decisionsView,
    setDecisionsView,
    openDecisions,
    statsOpen,
    setStatsOpen,
    toggleStats,
    select,
    openChat,
    showChat,
    openTicket,
  };
}
