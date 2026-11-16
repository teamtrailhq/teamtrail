import type { DiscoveryBrief } from '@teamtrail/core';
import { apiBase } from '../../lib/apiBase';

/** Briefs whose ready dialog this page already showed, for when the browser's storage is blocked. */
const shown = new Set<string>();

/** One brief as submitted: a resubmission after changes is a new one. The API base keeps projects apart. */
const keyOf = (b: DiscoveryBrief) => `teamtrail.brief-ready:${apiBase()}:${b.mapId}:${b.submittedAt ?? ''}`;

/**
 * Whether this browser has seen the "research is done" dialog for a brief: a per-viewer convenience kept in the
 * page's own storage. When storage is blocked it shows once per page load.
 */
export const briefReadySeen = {
  has(b: DiscoveryBrief): boolean {
    const key = keyOf(b);
    if (shown.has(key)) return true;
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  },
  add(b: DiscoveryBrief) {
    const key = keyOf(b);
    shown.add(key);
    try {
      localStorage.setItem(key, '1');
    } catch {
      // storage blocked: remembered for this page load only
    }
  },
};
