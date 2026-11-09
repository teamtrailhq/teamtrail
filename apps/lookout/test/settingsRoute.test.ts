import { describe, expect, it } from 'vitest';
import { parseSettingsRoute } from '../src/features/settings/parseSettingsRoute';
import { SETTINGS_GROUPS } from '../src/features/settings/settingsGroups';
import { settingsHref } from '../src/features/settings/settingsHref';
import { shownGroup } from '../src/features/settings/shownGroup';

const base = 'http://localhost:4100/?tracker=markdown';

describe('Settings routes', () => {
  it('is closed without ?settings=, and open with no group for an empty or unknown value', () => {
    expect(parseSettingsRoute(null)).toBeNull();
    expect(parseSettingsRoute('')).toEqual({});
    expect(parseSettingsRoute('top')).toEqual({});
  });

  it('opens a group by its id', () => {
    expect(parseSettingsRoute('alerts')).toEqual({ group: 'alerts' });
    expect(parseSettingsRoute('about')).toEqual({ group: 'about' });
  });

  it('keeps the existing deep links: slack and guides land in their group, at their section', () => {
    expect(parseSettingsRoute('slack')).toEqual({ group: 'alerts', section: 'slack' });
    expect(parseSettingsRoute('guides')).toEqual({ group: 'project', section: 'guides' });
  });

  it('reaches every section through its own link, and every section sits in exactly one group', () => {
    const ids = SETTINGS_GROUPS.flatMap((g) => g.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of SETTINGS_GROUPS) {
      for (const s of g.sections) expect(parseSettingsRoute(s.id)?.group).toBe(g.id);
    }
  });

  it('writes the route into the URL and reads it back, keeping other parameters', () => {
    const routes = [{}, { group: 'you' as const }, { group: 'project' as const, section: 'guides' as const }];
    for (const route of routes) {
      const href = settingsHref(base, route);
      expect(new URL(href).searchParams.get('tracker')).toBe('markdown');
      expect(parseSettingsRoute(new URL(href).searchParams.get('settings'))).toEqual(route);
    }
    expect(settingsHref(base, { group: 'alerts', section: 'slack' })).toBe(`${base}&settings=slack`);
  });

  it('drops the parameter when Settings closes', () => {
    expect(settingsHref(`${base}&settings=guides`, null)).toBe(base);
  });

  it('shows the first group on wide and laptop screens, and the list of groups on a phone, until one is picked', () => {
    expect(shownGroup({}, 'wide')?.id).toBe('trail');
    expect(shownGroup({}, 'laptop')?.id).toBe('trail');
    expect(shownGroup({}, 'mobile')).toBeUndefined();
    expect(shownGroup({ group: 'you' }, 'mobile')?.id).toBe('you');
  });
});
