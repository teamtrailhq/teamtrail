import { useCallback, useEffect, useReducer } from 'react';
import { saveManagedTheme, shownTheme } from '../lib/managedTheme';
import type { Prefs } from '../lib/prefs';
import { applyTheme } from '../lib/theme';
import { usePrefs } from './usePrefs';

/**
 * This browser's settings, with the theme put on the page. A server's own sign-in may carry the person's theme
 * (managedSignIn.ts): it wins over this browser's setting, and where the server saves themes, a theme picked here is
 * saved there too (managedTheme.ts).
 */
export function useThemedPrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, updateOwn] = usePrefs();
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => applyTheme(shownTheme(prefs.theme)), [prefs.theme, tick]);
  const update = useCallback(
    (p: Partial<Prefs>) => {
      if (p.theme) {
        saveManagedTheme(p.theme);
        bump();
      }
      updateOwn(p);
    },
    [updateOwn],
  );
  return [prefs, update];
}
