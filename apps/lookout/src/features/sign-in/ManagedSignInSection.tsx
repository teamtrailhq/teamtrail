import { Button } from '../../components/ui';
import type { ManagedSignIn } from '../../lib/managedSignIn';
import { SettingsSection } from '../settings/SettingsSection';

/** Settings → You → Signed in, when the server in front of the Lookout signs people in (lib/managedSignIn.ts). */
export function ManagedSignInSection({ managed }: { managed: ManagedSignIn }) {
  const { signOut } = managed;
  return (
    <SettingsSection title="Signed in">
      <p className="vf-intro">Signed in as {managed.name}. Sign-in is managed by the server this Lookout runs on.</p>
      {signOut ? (
        <div className="si-signout">
          <Button size="sm" variant="ghost" onClick={() => location.assign(signOut)}>
            Sign out
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
