import { BRAND } from '@teamtrail/core';
import { SettingsSection } from '../settings/SettingsSection';

/** The section on a device other than the one Teamtrail runs on: tokens are only made and revoked there. */
export function RemoteAgentsElsewhere() {
  return (
    <SettingsSection title="Remote agents">
      <p className="vf-intro">
        Tokens for remote agents are created and revoked on the machine {BRAND.name} runs on. Open the Lookout there to
        manage them.
      </p>
    </SettingsSection>
  );
}
