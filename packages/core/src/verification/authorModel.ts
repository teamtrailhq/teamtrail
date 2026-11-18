import { readAgentDoc } from '../agents/agentDocs';
import { agentPaths } from '../agents/agentLink';
import type { VerificationAttempt } from '../model/verification';

/**
 * The model the work's author ran on: the one its attempt recorded, else the one its session recorded at its claim
 * (attempts from before attempts kept a model). Undefined when neither knows.
 */
export function authorModelOf(root: string, a: Pick<VerificationAttempt, 'model' | 'sessionId'>): string | undefined {
  if (a.model) return a.model;
  if (!a.sessionId) return undefined;
  return readAgentDoc(root, agentPaths.session(a.sessionId))?.session.model;
}
