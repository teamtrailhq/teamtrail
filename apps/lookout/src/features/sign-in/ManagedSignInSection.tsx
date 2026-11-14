import { Button } from '../../components/ui';
import type { ManagedSignIn } from '../../lib/managedSignIn';
import { SettingsSection } from '../settings/SettingsSection';

/** Settings → You → Signed in, when the server in front of the Lookout signs people in (lib/managedSignIn.ts). */
export function ManagedSignInSection({ managed }: { managed: ManagedSignIn }) {
  const { signOut, pages } = managed;
  return (
    <SettingsSection title="Signed in">
      <p className="vf-intro">Signed in as {managed.name}. Sign-in is managed by the server this Lookout runs on.</p>
      {pages.length ? (
        <div className="choice-row">
          {pages.map((page) => (
            <Button key={page.href} size="sm" onClick={() => location.assign(page.href)}>
              {page.label}
            </Button>
          ))}
        </div>
      ) : null}
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
