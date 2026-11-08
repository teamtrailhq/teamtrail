import { arr, str, type Front } from '../../model/frontmatter';
import type { ModelMatching } from '../../model/types';
import { tiersOf } from '../modelMatchingOf';

/** `model-matching: on|off` and `model-tiers: [research=fast, …]` (the trail's own choices only) in `map.md`. */
export function readModelMatchingFront(front: Front): ModelMatching | undefined {
  const flag = str(front['model-matching']);
  if (flag !== 'on' && flag !== 'off') return undefined;
  const tiers = tiersOf(
    arr(front['model-tiers']).map((pair) => pair.split('=').map((x) => x.trim()) as [string, string]),
  );
  return Object.keys(tiers).length ? { enabled: flag === 'on', tiers } : { enabled: flag === 'on' };
}

export function writeModelMatchingFront(m?: ModelMatching): Front {
  if (!m) return {};
  const tiers = Object.entries(m.tiers ?? {}).map(([type, tier]) => `${type}=${tier}`);
  return { 'model-matching': m.enabled ? 'on' : 'off', ...(tiers.length ? { 'model-tiers': tiers } : {}) };
}
