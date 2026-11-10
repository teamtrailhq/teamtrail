export { createTrackerBridge } from './server/trackerBridge';
export type {
  BridgeContext,
  BridgeOptions,
  BridgePlugin,
  BridgePluginFactory,
  DecisionEvent,
  TrackerBridge,
} from './server/bridgeTypes';
export type { VerificationEvidenceEvent } from './server/verificationEvents';
export { activeTracker } from './server/activeTracker';
export { crossSite } from './server/trackerErrors';
export { fromThisMachine, requestRefusal, type PeerAddress } from './server/requestGuard';
export { configDir, credentialStore, type Credentials } from './server/trackerConfig';
export { AnswerError, readAgentDocs, writeAgentAnswer } from './agents/agentDocs';
export { attentionView } from './attention/attentionView';
export { readAttentionPolicy } from './attention/attentionStore';
export { readLookoutLock } from './agents/lookoutLock';
export { writeJsonAtomic } from './lib/jsonFile';
export { outboxFile, outboxKey } from './adapters/remote/outboxFile';
export { createProjectsHub, type ProjectsHub, type ProjectsHubOptions } from './server/projectsHub';
