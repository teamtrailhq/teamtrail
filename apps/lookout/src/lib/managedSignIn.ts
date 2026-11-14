/**
 * Sign-in managed by the server the Lookout runs behind (core signIn/externalSignIn.ts): `GET /session` says
 * `managed` instead of asking to pair. Then there is no session in this page, nothing to prove, and event streams
 * open as they are: the server in front signs every request in itself.
 */
export interface ManagedSignIn {
  /** Who the server says is signed in. */
  name: string;
  /** Where signing out happens, on this origin; none when the server offers no page for it. */
  signOut?: string;
}

let managed: ManagedSignIn | undefined;

/** The managed sign-in this page learned from `GET /session`, if any. */
export const managedSignIn = () => managed;

/** Read from a `GET /session` reply: kept only when it is well formed and its sign-out page is on this origin. */
export function learnManagedSignIn(reply: { managed?: unknown }) {
  const m = reply.managed as { name?: unknown; signOut?: unknown } | undefined;
  if (!m || typeof m.name !== 'string') return undefined;
  const sameOrigin = typeof m.signOut === 'string' && new URL(m.signOut, location.href).origin === location.origin;
  managed = { name: m.name, ...(sameOrigin ? { signOut: m.signOut as string } : {}) };
  return managed;
}
