import { useEffect, useState } from 'react';

const PARAM = 'ticket';
/** History state on the entry the full ticket pushed, so closing it steps back instead of adding an entry. */
const PUSHED = { fullTicket: true };

const ticketFromUrl = () => new URLSearchParams(location.search).get(PARAM) ?? undefined;
const pushed = () => !!(history.state as typeof PUSHED | null)?.fullTicket;

/**
 * The address with the full ticket's `?ticket=<id>`, or without it, keeping every other parameter but, with `overPage`,
 * the page it takes the place of (`?view=`).
 */
export function fullTicketHref(href: string, ticketId: string | undefined, overPage = false) {
  const url = new URL(href);
  url.searchParams.delete(PARAM);
  if (overPage) url.searchParams.delete('view');
  if (ticketId) url.searchParams.set(PARAM, ticketId);
  return url.toString();
}

/**
 * The full ticket and its place in the URL (`?ticket=<id>`). Opening it pushes one history entry, so the browser's
 * Back closes it and returns to where it was opened from (the map's bubble, a row of Hands-off's home); Forward opens
 * it again through `onShow`. A page load drops the parameter: the trail and its tickets load after the page, so it
 * would open on nothing.
 */
export function useFullTicketRoute(onShow: (ticketId: string) => void) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (ticketFromUrl()) history.replaceState(null, '', fullTicketHref(location.href, undefined));
    const sync = () => {
      const id = ticketFromUrl();
      if (id) onShow(id);
      setOpen(!!id);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Opens the full ticket on `ticketId`: replaces the entry while it is open, or the page's it takes the place of
   * (`fromPage`, a ticket opened from Activity or the Logbook), and pushes one when opening it over the map or home.
   */
  const show = (ticketId: string, fromPage = false) => {
    const href = fullTicketHref(location.href, ticketId, fromPage);
    if (pushed() || fromPage) history.replaceState(PUSHED, '', href);
    else history.pushState(PUSHED, '', href);
    setOpen(true);
  };
  /** Closes it: steps back over the entry it pushed, so Forward reopens it. */
  const close = () => {
    if (!open && !ticketFromUrl()) return;
    setOpen(false);
    if (pushed() && ticketFromUrl()) history.back();
    else if (ticketFromUrl()) history.replaceState(history.state, '', fullTicketHref(location.href, undefined));
  };
  return { open, show, close };
}
