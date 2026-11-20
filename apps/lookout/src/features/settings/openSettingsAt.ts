import { parseSettingsRoute } from './parseSettingsRoute';
import { settingsHref } from './settingsHref';

/**
 * Opens Settings at a group or section (`verification`) from anywhere in the page, as its deep link would: one history
 * entry pushed, marked as Settings' own so Back returns to where it was, and heard by app/useSettingsPage.ts.
 */
export function openSettingsAt(target: string) {
  const route = parseSettingsRoute(target);
  if (!route) return;
  history.pushState({ settingsPage: true }, '', settingsHref(location.href, route));
  window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
}
