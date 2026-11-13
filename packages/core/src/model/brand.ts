/**
 * The product name lives here and nowhere else. Renaming the product means
 * editing this file (plus the package.json names, which npm cannot read from code).
 * Changing `slug` also changes tracker labels, so existing maps would need relabelling.
 */
import type { TicketType } from './types';

const slug = 'teamtrail';

export const BRAND = {
  slug,
  /** The npm package and its command (`npx teamtrail`, `npm i -g teamtrail`). */
  npm: 'teamtrail',
  /** Display name. */
  name: 'Teamtrail',
  category: 'The trail map for AI coding agents',
  tagline: 'You pick the destination. Your agents walk the trail.',
  /** The platform's own voice: coordinator/system lines and onboarding. Worker agents keep their own ids. */
  assistant: {
    name: 'Scout',
  },
  /** Our own tracker label prefix: `<prefix>:map`, `<prefix>:research`, ... Follows the product name. */
  labelPrefix: slug,
  /** Default folder (relative to where the app is started) for the local-markdown tracker. */
  dataDir: `.${slug}`,
  /** Dev-server route prefix for the markdown file bridge. */
  apiPrefix: `/__${slug}`,
  /** Env var overriding the markdown data folder. */
  dataDirEnv: `${slug.toUpperCase()}_DIR`,
  /** Env var that keeps `mcp` and `connect` from adding their repo to the projects registry. */
  noRegisterEnv: `${slug.toUpperCase()}_NO_REGISTER`,
  /** Env var `connect --url` reads a remote agent's token from, and the one Codex reads it from at run time. */
  tokenEnv: `${slug.toUpperCase()}_TOKEN`,
} as const;

/** UI preference storage key. */
export const PREFS_KEY = `${slug}.prefs`;

export const label = (kind: string) => `${BRAND.labelPrefix}:${kind}`;
export const MAP_LABEL = label('map');
export const HITL_LABEL = label('hitl');
/** Types whose HITL flag is a choice (and so a label): junction and prototype are always HITL, research never. */
export const takesHitlLabel = (type: TicketType) => type === 'task' || type === 'execute';
export const PLAN_ONLY_LABEL = label('plan-only');
/** On a trail issue: the trail lead archived the trail (MapDoc.archived). */
export const ARCHIVED_LABEL = label('archived');
