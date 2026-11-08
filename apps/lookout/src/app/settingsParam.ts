/** `roles`: Settings opened at Roles, from the attention queue. */
export type SettingsOpen = false | 'top' | 'slack' | 'roles';

/** `?settings=slack` (from `teamtrail connect slack`) opens Settings on the Slack setup. */
export const settingsFromUrl = (): SettingsOpen =>
  new URLSearchParams(location.search).get('settings') === 'slack' ? 'slack' : false;

/** Drop `?settings=` once Settings closes so a reload doesn't reopen it. */
export function clearSettingsParam() {
  const url = new URL(location.href);
  if (url.searchParams.has('settings')) {
    url.searchParams.delete('settings');
    history.replaceState(null, '', url);
  }
}
