import { SettingsPanel } from '../features/settings';
import type { LookoutApi } from '../hooks';
import type { Prefs, Runtime } from '../lib';
import { clearSettingsParam } from './settingsParam';

/** Settings dialog for the active runtime; closing it also clears `?settings=` from the URL. */
export function AppSettings(props: {
  rt: Runtime;
  api: LookoutApi;
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  focus: 'top' | 'slack' | 'guides';
  onClose: () => void;
}) {
  const { rt, api } = props;
  return (
    <SettingsPanel
      prefs={props.prefs}
      update={props.update}
      activeTracker={rt.kind}
      location={rt.adapter.location}
      map={api.snap?.map}
      onMapMode={api.actions.setMode}
      focus={props.focus === 'top' ? undefined : props.focus}
      onClose={() => {
        props.onClose();
        clearSettingsParam();
      }}
    />
  );
}
