import type { ReadinessView } from '@teamtrail/core';

/**
 * Whether the project has no checks this machine approved, as repo readiness says it (`checks-none`: the file names
 * none; `checks-unapproved`: nobody approved it here). Nothing when readiness hasn't loaded or couldn't read the repo,
 * so the line never shows on a guess.
 */
export function checksMissing(view: ReadinessView | undefined): boolean {
  if (!view?.readiness.read) return false;
  return view.readiness.findings.some((f) => f.kind === 'checks');
}
