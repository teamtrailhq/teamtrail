import { managedPages, type ManagedPage } from './managedPages';
import { applyTheme, type ThemeChoice } from './theme';

const THEMES: ThemeChoice[] = ['auto', 'day', 'night'];

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
  /** The server's own pages for this person (who is in the workspace, say), on this origin. */
  pages: ManagedPage[];
  /** The theme this person picked on the server: the Lookout follows it in place of its own setting. */
  theme?: ThemeChoice;
  /** `false`: this person may not make high-risk calls, so the page routes those to someone who may. */
  highRisk?: boolean;
}

let managed: ManagedSignIn | undefined;

/** The managed sign-in this page learned from `GET /session`, if any. */
export const managedSignIn = () => managed;

/** Read from a `GET /session` reply: kept only when it is well formed; its sign-out and pages only on this origin. */
export function learnManagedSignIn(reply: { managed?: unknown }) {
  const m = reply.managed as
    { name?: unknown; signOut?: unknown; pages?: unknown; theme?: unknown; highRisk?: unknown } | undefined;
  if (!m || typeof m.name !== 'string') return undefined;
  const sameOrigin = typeof m.signOut === 'string' && new URL(m.signOut, location.href).origin === location.origin;
  const pages = managedPages(m.pages, location.origin);
  const theme = THEMES.find((t) => t === m.theme);
  managed = {
    name: m.name,
    pages,
    ...(sameOrigin ? { signOut: m.signOut as string } : {}),
    ...(theme ? { theme } : {}),
    ...(m.highRisk === false ? { highRisk: false } : {}),
  };
  if (theme) applyTheme(theme);
  return managed;
}
