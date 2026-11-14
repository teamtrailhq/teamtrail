import { managedSignIn } from '../../lib/managedSignIn';
import { DevicesSection, ManagedSignInSection } from '../sign-in';
import { SettingsSlot } from './SettingsSlot';

/** Settings → You → Browsers & devices, or who is signed in when the server in front manages sign-in. */
export function DevicesSlot() {
  const managed = managedSignIn();
  if (managed) return <ManagedSignInSection managed={managed} />;
  return (
    <SettingsSlot id="devices" storage="machine">
      <DevicesSection />
    </SettingsSlot>
  );
}
