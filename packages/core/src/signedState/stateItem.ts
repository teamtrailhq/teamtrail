import { DECISION_PATH, isTicketFile, segment } from '../adapters/markdown/paths';

/** What a tracker file is to the signed state: a trail's map, a ticket or a decision. */
export type StateItemKind = 'map' | 'ticket' | 'decision';

export interface StateItem {
  kind: StateItemKind;
  mapId: string;
  /** The ticket or decision id; the trail's id for its map. */
  id: string;
  /** The item's key in the trail's record: `map`, `ticket:<id>`, `decision:<id>`. */
  key: string;
  /** The file, relative to the tracker folder. */
  rel: string;
}

const MAP_PATH = /^([^/]+)\/map\.md$/;
const TICKET_PATH = /^([^/]+)\/tickets\/([^/]+)\.md$/;

export const itemKey = (kind: StateItemKind, id: string) => (kind === 'map' ? 'map' : `${kind}:${id}`);

const safe = (...ids: string[]) => {
  try {
    ids.forEach(segment);
    return true;
  } catch {
    return false;
  }
};

/** The item a tracker file holds, or undefined for any other file (briefs, criteria, knowledge, guides). */
export function stateItemOf(rel: string): StateItem | undefined {
  const item = matchItem(rel);
  return item && safe(item.mapId, item.id) ? item : undefined;
}

function matchItem(rel: string): StateItem | undefined {
  const map = rel.match(MAP_PATH);
  if (map) return { kind: 'map', mapId: map[1], id: map[1], key: 'map', rel };
  const ticket = isTicketFile(rel) ? rel.match(TICKET_PATH) : null;
  if (ticket) return { kind: 'ticket', mapId: ticket[1], id: ticket[2], key: itemKey('ticket', ticket[2]), rel };
  const decision = rel.match(DECISION_PATH);
  if (decision)
    return { kind: 'decision', mapId: decision[1], id: decision[2], key: itemKey('decision', decision[2]), rel };
  return undefined;
}

/** The item a record key names in a trail, with the file it lives in. */
export function stateItemFor(mapId: string, key: string): StateItem | undefined {
  if (key === 'map') return stateItemOf(`${mapId}/map.md`);
  const [kind, id] = key.split(':');
  if (kind === 'ticket') return stateItemOf(`${mapId}/tickets/${id}.md`);
  if (kind === 'decision') return stateItemOf(`${mapId}/decisions/${id}.md`);
  return undefined;
}
