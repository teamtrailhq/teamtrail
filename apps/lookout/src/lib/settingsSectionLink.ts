/**
 * A link to a Settings section from inside Settings (`?settings=<section>`): its address, and a click that moves
 * there in place, as the page's own navigation does (app/useSettingsPage.ts follows the address on `popstate`).
 */
export function settingsSectionLink(section: string) {
  const url = new URL(location.href);
  url.searchParams.set('settings', section);
  return {
    href: url.toString(),
    onClick: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      history.replaceState(history.state, '', url.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
  };
}
