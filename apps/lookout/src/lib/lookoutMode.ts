import { DEFAULT_LOOKOUT_MODE, type LookoutMode, lookoutModeOf } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { managedSignIn } from './managedSignIn';
import { responseError } from './responseError';

/** This browser's copy of the mode last shown, so the first paint doesn't flash the other one. */
const CACHE_KEY = 'teamtrail.lookout-mode';

/** The mode this browser last showed; the default when it has none or storage is blocked. */
export function cachedMode(): LookoutMode {
  try {
    return lookoutModeOf(localStorage.getItem(CACHE_KEY) ?? DEFAULT_LOOKOUT_MODE);
  } catch {
    return DEFAULT_LOOKOUT_MODE;
  }
}

export function cacheMode(mode: LookoutMode) {
  try {
    localStorage.setItem(CACHE_KEY, mode);
  } catch {
    // storage blocked: the next visit starts from the server's answer
  }
}

/**
 * Saves the person's mode. Behind a server that saves it (managedSignIn.ts `modeSave`), there, as JSON from this
 * page; otherwise in their own preferences on the Lookout's machine (`PUT /attention/mode`, never the repo).
 * Resolves to an error message, or undefined once saved.
 */
export async function saveMode(mode: LookoutMode): Promise<string | undefined> {
  cacheMode(mode);
  const m = managedSignIn();
  if (m?.modeSave) {
    m.mode = mode;
    const r = await fetch(m.modeSave, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(() => undefined);
    return responseError(r);
  }
  if (m) m.mode = undefined;
  const r = await fetch(`${apiBase()}/attention/mode`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  }).catch(() => undefined);
  return responseError(r);
}
