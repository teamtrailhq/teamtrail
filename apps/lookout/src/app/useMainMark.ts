import type { AttentionItem } from '@teamtrail/core';
import { mainTone, useMainChecks } from '../features/main-checks';

/**
 * Checks on main for the trail on screen, as the map's `main` marker: its tone (none while checks are off), and
 * whether the queue asks you to choose how the trail goes on.
 */
export function useMainMark(mapId: string | undefined, items: AttentionItem[]) {
  const m = useMainChecks(mapId);
  const asked = items.some((i) => i.kind === 'main-checks');
  const tone = mainTone(m.view, asked);
  return { tone, needs: tone === 'needs' };
}
