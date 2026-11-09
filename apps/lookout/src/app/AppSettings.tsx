import { SettingsPage } from '../features/settings';
import type { Breakpoint, LookoutApi } from '../hooks';
import type { Prefs, Runtime } from '../lib';
import type { useSettingsPage } from './useSettingsPage';

/** The Settings page for the active runtime, when open; it covers the zones and keeps the header. */
export function AppSettings(props: {
  rt: Runtime;
  api: LookoutApi;
  bp: Breakpoint;
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  settings: ReturnType<typeof useSettingsPage>;
}) {
  const { rt, api, settings } = props;
  if (!settings.route) return null;
  return (
    <SettingsPage
      bp={props.bp}
      route={settings.route}
      onShow={settings.show}
      onClose={settings.close}
      data={{
        prefs: props.prefs,
        update: props.update,
        activeTracker: rt.kind,
        location: rt.adapter.location,
        map: api.snap?.map,
        onMapMode: api.actions.setMode,
        snaps: Object.values(api.allSnaps),
        answered: api.activity.answered,
        onModelMatching: api.actions.setModelMatching,
      }}
    />
  );
}
