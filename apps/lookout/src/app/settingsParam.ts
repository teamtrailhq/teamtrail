/** `guides`: Settings opened at Guides, from the attention queue. */
export type SettingsOpen = false | 'top' | 'slack' | 'guides';

/** `?settings=slack` (from `teamtrail connect slack`) opens Settings on the Slack setup; `?settings=guides` on Guides. */
export function settingsFromUrl(): SettingsOpen {
  const v = new URLSearchParams(location.search).get('settings');
  return v === 'slack' || v === 'guides' ? v : false;
}

/** Drop `?settings=` once Settings closes so a reload doesn't reopen it. */
export function clearSettingsParam() {
  const url = new URL(location.href);
  if (url.searchParams.has('settings')) {
    url.searchParams.delete('settings');
    history.replaceState(null, '', url);
  }
}
