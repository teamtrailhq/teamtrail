import type { AnswerVia } from './answerVia';
import type { RiskCategory } from './risk';

/** A question the human answered: who asked it, and on what, with what (what the answer can cover). */
export interface AnsweredQuestion {
  id: string;
  mapId: string;
  sessionId: string;
  agent: string;
  askedAt: number;
  answeredAt: number;
  /** What the question was asked on and with: what the answer can cover (policy/policyViolations.ts). */
  ticketId?: string;
  category?: RiskCategory;
  urgency?: 'blocking' | 'soon' | 'fyi';
  /** How it was given; none on answers from before labels, which count as chat (answerVia.ts). */
  via?: AnswerVia;
  /** For `chat`: the agent whose chat it was given in. */
  chatOf?: string;
  /** This machine's signature, added where the session doc is written (agents/answeredSignature.ts). */
  sig?: string;
}
