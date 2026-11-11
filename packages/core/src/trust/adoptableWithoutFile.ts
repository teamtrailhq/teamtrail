import { levelOf, VERIFICATION_LEVELS } from '../model/lifecycle';
import { trustedChecks } from '../verification/checksApproval';
import type { TrustItem } from './trustItem';

/**
 * Whether an item with no file to check in git (a level or a type on GitHub or Linear) may come along in a bulk
 * adoption: only a level at least the approved config's default, which lowers nothing. Anything else, a lowered level
 * or a changed type someone else wrote into an issue, is approved on its own.
 */
export function adoptableWithoutFile(root: string, item: TrustItem): boolean {
  if (item.kind !== 'level') return false;
  const def = trustedChecks(root).config.config?.default;
  const level = levelOf(item.content);
  if (!def || !level) return false;
  return VERIFICATION_LEVELS.indexOf(level) >= VERIFICATION_LEVELS.indexOf(def);
}
