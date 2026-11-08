import { BRAND } from '@teamtrail/core';

/** `?item=<attention item id>`: the queue item a link from All projects opens (app/useItemLink.ts). */
export const ITEM_PARAM = 'item';

/** A project id as the hub hands them out: a short hex hash. */
const ID = /^[0-9a-f]{6,64}$/;

/** The project this page shows: `?project=<id>`, or undefined for the folder the Lookout was started in. */
export function activeProject(): string | undefined {
  const id = new URLSearchParams(location.search).get('project') ?? undefined;
  return id && ID.test(id) ? id : undefined;
}

/**
 * Where this page's tracker API lives. The home project keeps the un-prefixed API, exactly as with one repo;
 * another project is served at `/p/<id>` by the same process. Switching projects reloads the page, so every
 * module reads this once and the runtime is rebuilt with the same code paths.
 */
export function apiBase(project = activeProject()): string {
  return project ? `${BRAND.apiPrefix}/p/${project}` : BRAND.apiPrefix;
}

/**
 * The URL that opens a project in place: no `?project` for home. Another project also names its tracker, since
 * the saved tracker choice belongs to the home project.
 */
export function projectHref(to: { id?: string; home: string; tracker?: string; item?: string }): string {
  const q = new URLSearchParams(location.search);
  for (const k of ['projects', 'project', 'tracker', ITEM_PARAM]) q.delete(k);
  if (to.item) q.set(ITEM_PARAM, to.item);
  if (to.id && to.id !== to.home) q.set('project', to.id);
  if (to.id && to.id !== to.home && to.tracker) q.set('tracker', to.tracker);
  const s = q.toString();
  return `${location.pathname}${s ? `?${s}` : ''}`;
}
