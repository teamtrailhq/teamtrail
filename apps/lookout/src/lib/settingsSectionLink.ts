/**
 * A link to a Settings section (`?settings=<section>`): its address, and a click that moves there in place, as the
 * page's own navigation does (app/useSettingsPage.ts follows the address on `popstate`). Inside Settings it replaces
 * the entry; from the Lookout it pushes one, marked as Settings', so the browser's Back and closing Settings return.
 */
export function settingsSectionLink(section: string) {
  const url = new URL(location.href);
  url.searchParams.set('settings', section);
  return {
    href: url.toString(),
    onClick: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      if (new URLSearchParams(location.search).has('settings')) history.replaceState(history.state, '', url.toString());
      else history.pushState({ settingsPage: true }, '', url.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
  };
}
