import type { AttentionSource } from '../types';
import { approvalSource } from './approvalSource';
import { blockedSource } from './blockedSource';
import { briefSource } from './briefSource';
import { flagSource } from './flagSource';
import { hitlReadySource } from './hitlReadySource';
import { integrationSource } from './integrationSource';
import { knowledgeSource } from './knowledgeSource';
import { modelSource } from './modelSource';
import { overlapSource } from './overlapSource';
import { policySource } from './policySource';
import { questionSource } from './questionSource';
import { rerouteSource } from './rerouteSource';
import { rerouteSuggestedSource } from './rerouteSuggestedSource';
import { stalledSource } from './stalledSource';

/**
 * Every attention source. Adding a kind: write `sources/<kind>Source.ts`, list it here, and give the
 * kind a weight in `defaults.ts` (`policy`, `reroute` and `reroute-suggested` already have one).
 */
export const ATTENTION_SOURCES: AttentionSource[] = [
  questionSource,
  approvalSource,
  blockedSource,
  flagSource,
  stalledSource,
  hitlReadySource,
  knowledgeSource,
  briefSource,
  rerouteSource,
  rerouteSuggestedSource,
  policySource,
  overlapSource,
  integrationSource,
  modelSource,
];
