import type { Prefs, TrackerChoice } from '../../lib';
import { managedSignIn } from '../../lib/managedSignIn';
import { Onboarding } from './Onboarding';

/** The first-run questions, unless a server that keeps the trails itself (managed.tracker) leaves nothing to ask. */
export function FirstRun(props: { prefs: Prefs; update: (p: Partial<Prefs>) => void; activeTracker: TrackerChoice }) {
  if (managedSignIn()?.tracker) return null;
  return <Onboarding {...props} />;
}
