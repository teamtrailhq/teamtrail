import { managedSignIn } from '../../lib/managedSignIn';
import { HeaderMenu } from './HeaderMenu';
import { ManagedItems } from './ManagedItems';

/**
 * In a Lookout behind a server's own sign-in (lib/managedSignIn.ts): the person's menu, with the server's home (all
 * their workspaces), its pages for this workspace, and Sign out. Nothing when the Lookout runs on its own.
 */
export function ManagedMenu() {
  const managed = managedSignIn();
  if (!managed) return null;
  return (
    <HeaderMenu label={managed.name} tip="Your account on the server this Lookout runs on">
      {(close) => <ManagedItems managed={managed} close={close} />}
    </HeaderMenu>
  );
}
