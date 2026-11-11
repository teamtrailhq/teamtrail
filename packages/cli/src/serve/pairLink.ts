import { BRAND } from '@teamtrail/core';

/**
 * The one-time link that signs a browser in to the Lookout at `base` (`http://localhost:7420/`), then opens it,
 * on `next` when given (`?settings=slack`).
 */
export function pairLink(base: string, code: string, next = '') {
  const then = next ? `&next=${encodeURIComponent(next)}` : '';
  return `${base.replace(/\/?$/, '/')}${BRAND.apiPrefix.slice(1)}/pair?code=${code}${then}`;
}
