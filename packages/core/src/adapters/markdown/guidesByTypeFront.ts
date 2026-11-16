import { arr, type Front } from '../../model/frontmatter';
import { ALL_TICKET_TYPES, type GuidesByType, type TicketType } from '../../model/types';

const KEY = 'guides-by-type';

/**
 * `guides-by-type: [research=architect, task=qa, task=security]` in `map.md`: one `type=guide` pair per entry.
 * Missing means the defaults; `[]` means no guides for any type. Unknown types and malformed pairs are skipped.
 */
export function readGuidesByTypeFront(front: Front): GuidesByType | undefined {
  if (front[KEY] === undefined) return undefined;
  const out: GuidesByType = {};
  for (const pair of arr(front[KEY])) {
    const [type, id] = pair.split('=').map((x) => x.trim());
    if (!id || !ALL_TICKET_TYPES.includes(type as TicketType)) continue;
    const list = out[type as TicketType] ?? [];
    if (!list.includes(id)) out[type as TicketType] = [...list, id];
  }
  return out;
}

export function writeGuidesByTypeFront(m?: GuidesByType): Front {
  if (!m) return {};
  const pairs = ALL_TICKET_TYPES.flatMap((type) => (m[type] ?? []).map((id) => `${type}=${id}`));
  return { [KEY]: pairs };
}
