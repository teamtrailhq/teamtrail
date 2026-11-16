import type { GuidesByType } from '../model/types';

/**
 * The guides each ticket type takes on when its trail has no mapping of its own: the architect on the tickets that
 * decide, qa and security on the ones that build, the reviewer on reviews. Docs is off by default.
 */
export const DEFAULT_GUIDES_BY_TYPE: Readonly<GuidesByType> = Object.freeze({
  research: ['architect'],
  junction: ['architect'],
  prototype: ['architect'],
  task: ['qa', 'security'],
  execute: ['qa', 'security'],
  review: ['reviewer'],
});
