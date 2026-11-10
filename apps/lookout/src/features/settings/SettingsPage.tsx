import { useEffect } from 'react';
import { Label, Panel } from '../../components/ui';
import type { Breakpoint } from '../../hooks';
import { ElsewhereNote } from './ElsewhereNote';
import { SettingsGroupPane } from './SettingsGroupPane';
import { SettingsNav } from './SettingsNav';
import { shownGroup } from './shownGroup';
import type { SettingsData, SettingsGroupId, SettingsRoute } from './types';
import { useThisMachine } from './useThisMachine';

/** What the back control says: on a phone, the list of groups or one group; elsewhere the whole page. */
const BACK = { page: 'Back to the Lookout', list: 'Lookout', group: 'Settings' } as const;

/** Where the page is: the side nav and a group side by side, or on a phone the list or one group. */
const settingsStep = (phone: boolean, inGroup: boolean): keyof typeof BACK => {
  if (!phone) return 'page';
  return inGroup ? 'group' : 'list';
};

/**
 * Settings as a full page: covers the zones under the header like the Logbook, with a side nav of groups and one
 * group at a time on the right. On a phone the nav is the first screen and drills into one group. Esc steps back:
 * from a group to the list on a phone, otherwise to the Lookout. A dialog open on top (a scrim) keeps Esc for itself.
 */
export function SettingsPage(props: {
  bp: Breakpoint;
  route: SettingsRoute;
  data: SettingsData;
  onShow: (route: SettingsRoute) => void;
  onClose: () => void;
}) {
  const { bp, route } = props;
  const phone = bp === 'mobile';
  const shown = shownGroup(route, bp);
  const step = settingsStep(phone, !!shown);
  const elsewhere = useThisMachine() === false;
  const back = () => (step === 'group' ? props.onShow({}) : props.onClose());
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.scrim')) return;
      if (step === 'group') props.onShow({});
      else props.onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [step, props]);
  const pick = (group: SettingsGroupId) => props.onShow({ group });
  const nav = step !== 'group' && <SettingsNav current={shown?.id} onPick={pick} drill={phone} />;

  return (
    <Panel className={`zone decisions-view settings-page sp-${bp}`} aria-label="Settings">
      <header className="dv-head">
        <button className="back" onClick={back}>
          ‹ {BACK[step]}
        </button>
        {step !== 'group' && <Label as="h2">Settings</Label>}
        {!phone && <span className="dv-head-right t-meta">Esc</span>}
      </header>
      {elsewhere && <ElsewhereNote />}
      <div className="sp-body">
        {nav}
        {shown && <SettingsGroupPane group={shown} data={props.data} route={route} />}
      </div>
    </Panel>
  );
}
