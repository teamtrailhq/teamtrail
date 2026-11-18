import { type AttentionView, type LookoutMode, lookoutModeOf } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { cacheMode, cachedMode, saveMode } from '../lib/lookoutMode';
import { managedSignIn } from '../lib/managedSignIn';
import type { Prefs } from '../lib/prefs';

/**
 * This person's Hands-off or Hands-on (core model/attention.ts `LookoutMode`): the server's, behind a server's own sign-in that
 * keeps one; else their preference on the Lookout's machine, read with the attention queue (`prefs.mode`, missing is
 * Hands-off); until that loads, what this browser showed last. A switch shows at once and is saved (lib/lookoutMode.ts);
 * another device's switch arrives with the queue.
 */
export function useLookoutMode(view?: AttentionView) {
  const [picked, setPicked] = useState<LookoutMode>();
  const [error, setError] = useState<string>();
  const saved = view ? lookoutModeOf(view.prefs.mode) : undefined;
  // the queue says what was saved: a switch made here, or on another device, from now on
  useEffect(() => setPicked(undefined), [saved]);
  const mode = picked ?? managedSignIn()?.mode ?? saved ?? cachedMode();
  useEffect(() => cacheMode(mode), [mode]);
  const setMode = useCallback((next: LookoutMode) => {
    setPicked(next);
    void saveMode(next).then(setError);
  }, []);
  const handsOff = mode === 'hands-off';
  return {
    mode,
    handsOff,
    setMode,
    error,
    /** The trail Hands-off's home shows: the one on screen; none in Hands-on, or before there is a trail. */
    homeOf: <T>(snap?: T) => (handsOff ? snap : undefined),
    /** The page's layout: Hands-off's only with a trail to show (before one, both start from the empty map). */
    layout: (snap?: unknown): LookoutMode => (handsOff && snap ? 'hands-off' : 'hands-on'),
    /** Hands-off tells what happened since the last visit on its home: the trip report waits behind Records. */
    briefing: (p: Prefs['briefing']): Prefs['briefing'] => ({ ...p, enabled: p.enabled && !handsOff }),
  };
}

export type LookoutModeApi = ReturnType<typeof useLookoutMode>;
