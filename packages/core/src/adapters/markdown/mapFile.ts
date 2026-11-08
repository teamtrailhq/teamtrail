import { MAP_LABEL, PLAN_ONLY_LABEL } from '../../model/brand';
import { arr, iso, parseFront, str, time, writeFront } from '../../model/frontmatter';
import { levelOf } from '../../model/lifecycle';
import { parseMapBody, serializeMapBody } from '../../model/mapBody';
import { DEFAULT_MAP_MODE, type MapDoc } from '../../model/types';

/** `<map-slug>/map.md`: frontmatter + canonical map body. */
export function parseMapFile(mapId: string, md: string): MapDoc {
  const { front, body } = parseFront(md);
  const verification = levelOf(str(front.verification));
  return {
    id: mapId,
    key: str(front.key) || mapId,
    title: str(front.title) || mapId,
    mode:
      str(front.mode) === 'plan-only' || arr(front.labels).includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
    ...(verification ? { verification } : {}),
    ...(arr(front.roles).length ? { roles: arr(front.roles) } : {}),
    sections: parseMapBody(body),
    createdAt: time(front.created),
    updatedAt: time(front.updated),
  };
}

export function serializeMapFile(m: MapDoc) {
  return writeFront(
    {
      key: m.key,
      title: m.title,
      mode: m.mode,
      ...(m.verification ? { verification: m.verification } : {}),
      ...(m.roles?.length ? { roles: m.roles } : {}),
      labels: [MAP_LABEL, ...(m.mode === 'plan-only' ? [PLAN_ONLY_LABEL] : [])],
      created: iso(m.createdAt),
      updated: iso(m.updatedAt),
    },
    serializeMapBody(m.sections),
  );
}
