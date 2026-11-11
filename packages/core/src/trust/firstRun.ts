import { trustLedger } from './trustLedger';

/**
 * Whether the trail lead has approved nothing on this machine for this project yet: a fresh clone, a new machine, or
 * the upgrade to approvals kept per machine. Only then may committed content be adopted in one step; after that each
 * item is approved on its own, read in full. Levels and types Teamtrail records by itself don't count.
 */
export const firstRun = (root: string) =>
  Object.keys(trustLedger(root).all()).every((k) => k.startsWith('level:') || k.startsWith('type:'));

/**
 * Whether the trail lead has never accepted a trail's outside changes on this machine (signedState/): a fresh
 * clone, a new machine, or the upgrade to signed trail state, even where other approvals were made before. Until
 * then, committed trail files may be adopted in one step; after the first acceptance each change is its own.
 */
export const stateFirstRun = (root: string) => !trustLedger(root).get('state');
