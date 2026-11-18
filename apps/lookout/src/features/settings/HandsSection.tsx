import type { LookoutMode } from '@teamtrail/core';
import { managedSignIn } from '../../lib/managedSignIn';
import { ModeSwitch } from '../hands-off';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';

/**
 * Settings → You → Hands-off or Hands-on: what the Lookout shows this person. Saved for them (their account, behind a
 * server that keeps it), never in the repo, and never a change to what agents may decide or how work is verified.
 */
export function HandsSection(props: { mode: LookoutMode; onChange: (mode: LookoutMode) => void }) {
  const account = !!managedSignIn()?.modeSave;
  return (
    <SettingsSlot id="hands" storage={account ? undefined : 'machine'}>
      <SettingsSection title="Hands-off or Hands-on">
        <p className="vf-intro">
          Hands-off shows only what needs you, how far the trail is and what happened while you were away. Hands-on is
          the map and every view. Either way agents decide only what the risk policy lets them, and work is verified
          just as strictly.
        </p>
        <ModeSwitch mode={props.mode} onChange={props.onChange} />
        {account && <p className="vf-intro">Saved to your account, so every device follows it.</p>}
      </SettingsSection>
    </SettingsSlot>
  );
}
