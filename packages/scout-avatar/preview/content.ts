import type { ScoutState, ScoutStyleId } from '../src/scout';

export const LINES = {
  plan: 'Trail plan is ready. Three tickets are queued for agents.',
  decision: 'Session 2 needs your call on the auth provider before it can continue.',
  pickup: "Picking up the package build. I'll report back when it's green.",
};
export const SPEAK_AT = 1500;
export const ORDER: ScoutStyleId[] = ['crt'];
export const TAGLINE = 'You pick the destination. Your agents walk the trail.';
/** The wordmark's text, lowercase, before its dot; override with `?wordmark=` (capture: WORDMARK env). */
export const WORDMARK = 'teamtrail';

export const SCRIPT: { state: ScoutState; speaking?: string; ms: number; log?: string; hot?: boolean }[] = [
  { state: 'idle', ms: 2200 },
  { state: 'thinking', ms: 1900 },
  { state: 'speaking', speaking: LINES.plan, ms: LINES.plan.length * 55 + 800, log: LINES.plan },
  { state: 'alert', ms: 2400, log: LINES.decision, hot: true },
  { state: 'speaking', speaking: LINES.decision, ms: LINES.decision.length * 55 + 800 },
  { state: 'thinking', ms: 1300 },
  { state: 'speaking', speaking: LINES.pickup, ms: LINES.pickup.length * 55 + 800, log: LINES.pickup },
  { state: 'idle', ms: 1400 },
];

/** The animated README banner's length: one pass of these steps (the trail walks, then rests at its destination). */
export const BANNER_LOOP = SCRIPT.slice(0, 4);
