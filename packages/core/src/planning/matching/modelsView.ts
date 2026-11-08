import type { ModelTier } from '../../model/modelTier';
import type { ConnectedAgent, ModelWait } from './modelWaits';

/** `GET /models`: the project's extra models, the agents connected now with their tiers, and what waits on a model. */
export interface ModelsView {
  /** Tracker-relative path of the project's model table. */
  file: string;
  exists: boolean;
  errors: string[];
  models: Record<string, ModelTier>;
  agents: ConnectedAgent[];
  /** Ready tickets, on trails with model matching on, that no connected agent's tier reaches. */
  waiting: ModelWait[];
}
