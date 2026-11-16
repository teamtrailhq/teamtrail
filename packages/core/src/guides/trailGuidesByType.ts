import { ALL_TICKET_TYPES, type GuidesByType, type MapDoc } from '../model/types';
import { DEFAULT_GUIDES_BY_TYPE } from './defaultGuidesByType';

/**
 * Where a trail's guides by type come from: `trail`, its own mapping; `defaults`, the defaults; `team`, the defaults
 * kept within the team a trail had before guides came by type.
 */
export type GuidesByTypeSource = 'trail' | 'defaults' | 'team';

const sourceOf = (map: Pick<MapDoc, 'guidesByType'>, team: boolean): GuidesByTypeSource => {
  if (map.guidesByType) return 'trail';
  return team ? 'team' : 'defaults';
};

/**
 * The guides each ticket type of `map` takes on. A recorded mapping is used as it is. Without one, the defaults
 * apply; a trail that had a team (`guides`) keeps it as the list they are kept within, so its tickets get no guide
 * the trail lead hadn't put on it. Every type is listed, in one order, each with its ids in one order.
 */
export function trailGuidesByType(map: Pick<MapDoc, 'guides' | 'guidesByType'>): {
  byType: Record<string, string[]>;
  source: GuidesByTypeSource;
} {
  const team = map.guides?.length ? new Set(map.guides) : undefined;
  const from: GuidesByType = map.guidesByType ?? DEFAULT_GUIDES_BY_TYPE;
  const keep = (id: string) => !!map.guidesByType || !team || team.has(id);
  const byType = Object.fromEntries(
    ALL_TICKET_TYPES.map((type) => [type, [...new Set((from[type] ?? []).filter(keep))]]),
  );
  return { byType, source: sourceOf(map, !!team) };
}
