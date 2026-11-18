import type { ManagedSignIn } from '../../lib/managedSignIn';

/**
 * The server's home (all of a person's workspaces), its pages for this workspace and Sign out, as menu items: in the
 * person's menu (ManagedMenu.tsx), and on a phone in More.
 */
export function ManagedItems(props: { managed: ManagedSignIn; close: () => void }) {
  const { managed } = props;
  const go = (href: string) => {
    props.close();
    location.assign(href);
  };
  return (
    <>
      {managed.home && (
        <button role="menuitem" className="header-menu-item" onClick={() => go(managed.home!.href)}>
          ← {managed.home.label}
        </button>
      )}
      {managed.pages.map((page) => (
        <button key={page.href} role="menuitem" className="header-menu-item" onClick={() => go(page.href)}>
          {page.label}
        </button>
      ))}
      {managed.signOut && (
        <button role="menuitem" className="header-menu-item" onClick={() => go(managed.signOut!)}>
          Sign out
        </button>
      )}
    </>
  );
}
