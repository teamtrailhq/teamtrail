import { managedSignIn } from '../../lib/managedSignIn';
import { HeaderMenu } from './HeaderMenu';

/**
 * In a Lookout behind a server's own sign-in (lib/managedSignIn.ts): the person's menu, with the server's home (all
 * their workspaces), its pages for this workspace, and Sign out. Nothing when the Lookout runs on its own.
 */
export function ManagedMenu() {
  const managed = managedSignIn();
  if (!managed) return null;
  const go = (href: string, close: () => void) => {
    close();
    location.assign(href);
  };
  return (
    <HeaderMenu label={managed.name} tip="Your account on the server this Lookout runs on">
      {(close) => (
        <>
          {managed.home && (
            <button role="menuitem" className="header-menu-item" onClick={() => go(managed.home!.href, close)}>
              ← {managed.home.label}
            </button>
          )}
          {managed.pages.map((page) => (
            <button key={page.href} role="menuitem" className="header-menu-item" onClick={() => go(page.href, close)}>
              {page.label}
            </button>
          ))}
          {managed.signOut && (
            <button role="menuitem" className="header-menu-item" onClick={() => go(managed.signOut!, close)}>
              Sign out
            </button>
          )}
        </>
      )}
    </HeaderMenu>
  );
}
