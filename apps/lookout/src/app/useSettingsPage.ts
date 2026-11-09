import { useEffect, useState } from 'react';
import { parseSettingsRoute, settingsHref, type SettingsRoute } from '../features/settings';

/** History state on the entry Settings pushed, so closing can step back to the Lookout instead of adding an entry. */
const PUSHED = { settingsPage: true };

const routeFromUrl = () => parseSettingsRoute(new URLSearchParams(location.search).get('settings'));
const pushed = () => !!(history.state as typeof PUSHED | null)?.settingsPage;

/**
 * The Settings page and its place in the URL (`?settings=<group or section>`). Opening pushes one history entry and
 * moving between groups replaces it, so the browser's Back button always returns to the Lookout. A deep link that
 * loads the page straight into Settings gets a Lookout entry underneath it for the same reason.
 */
export function useSettingsPage() {
  const [route, setRoute] = useState<SettingsRoute | null>(routeFromUrl);
  useEffect(() => {
    if (route && !pushed()) {
      history.replaceState(null, '', settingsHref(location.href, null));
      history.pushState(PUSHED, '', settingsHref(location.href, route));
    }
    const sync = () => setRoute(routeFromUrl());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Shows a route: replaces the entry while Settings is open, pushes one when opening it. */
  const show = (next: SettingsRoute) => {
    const href = settingsHref(location.href, next);
    if (route) history.replaceState(history.state, '', href);
    else history.pushState(PUSHED, '', href);
    setRoute(next);
  };
  /** Back to the Lookout: steps back over the entry Settings pushed, so Forward reopens it. */
  const close = () => {
    if (!route) return;
    setRoute(null);
    if (pushed()) history.back();
    else history.replaceState(null, '', settingsHref(location.href, null));
  };
  /** Opens Settings at a group or section (`slack`, `guides`), or with no group chosen. */
  const open = (target?: string) => show(parseSettingsRoute(target ?? '') ?? {});

  return { route, open, show, close, toggle: () => (route ? close() : open()) };
}
