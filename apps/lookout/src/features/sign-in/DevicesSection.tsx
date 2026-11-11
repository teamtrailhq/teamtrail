import { Button } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { PairDevicePanel } from './PairDevicePanel';
import { SignInList } from './SignInList';
import { SignInNotes } from './SignInNotes';
import { useSignIns } from './useSignIns';

/**
 * Settings → You → Browsers & devices: every browser paired with this Lookout, Revoke, Pair a device and Sign
 * out. On another device only Sign out: pairing and revoking happen on the machine the Lookout runs on.
 */
export function DevicesSection() {
  const { view, device, closeDevice, pairDevice, revoke, signOut } = useSignIns();
  if (!view) return null;
  const signOutButton = (
    <div className="si-signout">
      <Button size="sm" variant="ghost" onClick={signOut}>
        Sign out of this browser
      </Button>
    </div>
  );
  if (view === 'elsewhere')
    return (
      <SettingsSection title="Browsers & devices">
        <p className="vf-intro">
          This device is paired with the Lookout. Browsers and devices are paired and revoked on the machine it runs on.
        </p>
        {signOutButton}
      </SettingsSection>
    );
  return (
    <SettingsSection title="Browsers & devices">
      <p className="vf-intro">
        Every browser that opens this Lookout is paired once, and stays signed in until 30 days after it was last used.
        Revoke one and it’s signed out at once.
      </p>
      <SignInList sessions={view.sessions} onRevoke={revoke} />
      <PairDevicePanel lan={view.lan} device={device} onPair={pairDevice} onDone={closeDevice} />
      {signOutButton}
      <SignInNotes />
    </SettingsSection>
  );
}
