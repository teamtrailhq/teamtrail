/** The pages that cover the map, opened from the header's tabs (and on a phone, the tab bar). */
export type Page = 'plan' | 'activity' | 'logbook';

export const PAGES: Page[] = ['plan', 'activity', 'logbook'];

/** A view tab: the map, or one of the pages. */
export type View = 'map' | Page;

export const VIEW_TABS: { id: View; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'plan', label: 'Plan' },
  { id: 'activity', label: 'Activity' },
  { id: 'logbook', label: 'Logbook' },
];
