import { apiBase } from '../../lib/apiBase';

/** Trails whose "destination reached" dialog this page already showed, for when the browser's storage is blocked. */
const shown = new Set<string>();

/** One trail; the API base keeps projects apart. */
const keyOf = (mapId: string) => `teamtrail.trail-done:${apiBase()}:${mapId}`;

/**
 * Whether this browser has seen the "destination reached" dialog for a trail: a per-viewer convenience kept in the
 * page's own storage. When storage is blocked it shows once per page load.
 */
export const trailDoneSeen = {
  has(mapId: string): boolean {
    const key = keyOf(mapId);
    if (shown.has(key)) return true;
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  },
  add(mapId: string) {
    const key = keyOf(mapId);
    shown.add(key);
    try {
      localStorage.setItem(key, '1');
    } catch {
      // storage blocked: remembered for this page load only
    }
  },
};
