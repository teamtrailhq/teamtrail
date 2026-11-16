import { managedSignIn } from './managedSignIn';
import { applyTheme, type ThemeChoice } from './theme';

/** A server theme this page can't change: the server set one and offers nowhere to save another. */
export const managedThemeFixed = () => !!managedSignIn()?.theme && !managedSignIn()?.themeSave;

/** The theme to show: the server's when it set one, else this browser's own setting. */
export const shownTheme = (own: ThemeChoice) => managedSignIn()?.theme ?? own;

/**
 * A theme picked here, when the server saves themes (managedSignIn.ts `themeSave`): applied at once and saved there
 * as JSON from this page (its own origin), so the server's pages and the next visit follow. Nothing to do otherwise.
 */
export function saveManagedTheme(theme: ThemeChoice) {
  const m = managedSignIn();
  if (!m?.themeSave) return;
  m.theme = theme;
  applyTheme(theme);
  void fetch(m.themeSave, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  }).catch(() => undefined);
}
