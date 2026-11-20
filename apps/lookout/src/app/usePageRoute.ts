import { useEffect, useState } from 'react';
import { type Page, PAGES } from './tabs';

const PARAM = 'view';
/** History state on an entry a page (or Settings) pushed over the map, so closing steps back instead of adding one. */
const PUSHED = { lookoutPage: true };

const pageFromUrl = (): Page | null => {
  const v = new URLSearchParams(location.search).get(PARAM);
  return PAGES.includes(v as Page) ? (v as Page) : null;
};
/** An entry over the map: one a page pushed, or Settings. */
const overMap = () => {
  const s = history.state as { lookoutPage?: boolean; settingsPage?: boolean } | null;
  return !!(s?.lookoutPage || s?.settingsPage);
};

function pageHref(page: Page | null) {
  const url = new URL(location.href);
  url.searchParams.delete(PARAM);
  url.searchParams.delete('settings');
  if (page) url.searchParams.set(PARAM, page);
  return url.toString();
}

/**
 * The page that covers the map (Plan, Activity, the Logbook) and its place in the URL (`?view=plan`). Opening one
 * over the map pushes one history entry and moving between pages replaces it, so the browser's Back button always
 * returns to the map. A deep link straight to a page gets the map's entry underneath it for the same reason.
 */
export function usePageRoute() {
  const [page, setPage] = useState<Page | null>(pageFromUrl);
  useEffect(() => {
    if (page && !overMap()) {
      history.replaceState(null, '', pageHref(null));
      history.pushState(PUSHED, '', pageHref(page));
    }
    const sync = () => setPage(pageFromUrl());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Back to the map: steps back over the entry a page pushed, so Forward reopens it. */
  const close = () => {
    if (!page && !new URLSearchParams(location.search).has('settings')) return;
    setPage(null);
    if ((history.state as typeof PUSHED | null)?.lookoutPage) history.back();
    else history.replaceState(null, '', pageHref(null));
  };
  /** Shows a page: replaces the entry while one (or Settings) covers the map, pushes one when opening over it. */
  const open = (next: Page) => {
    const href = pageHref(next);
    if (overMap()) history.replaceState(PUSHED, '', href);
    else history.pushState(PUSHED, '', href);
    setPage(next);
  };
  /** Leaves the page for what takes its place in the URL (the full ticket), without stepping back. */
  const dismiss = () => setPage(null);
  return { page, open, close, dismiss };
}
