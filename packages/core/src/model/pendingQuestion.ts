import type { RiskCategory } from './risk';

/** An agent's question waiting for the human. */
export interface PendingQuestion {
  id: string;
  sessionId: string;
  mapId: string;
  ticketId?: string;
  agent: string;
  text: string;
  /** Suggested replies, shown as one-click answers. */
  suggestions?: string[];
  at: number;
  /** What the call touches (risk policy), when the agent named it. */
  category?: RiskCategory;
  /** Every category the question is about, when the agent named more than one (`category` is the first). */
  categories?: RiskCategory[];
  /** How much the agent needs the answer (attention ranking); missing means `soon`. */
  urgency?: 'blocking' | 'soon' | 'fyi';
  /** Ids of tickets that can't move until this is answered. */
  blocks?: string[];
  /**
   * What answering it in the Lookout or Slack lets the agent do, said with the question so a one-click reply is no
   * surprise: "Answering this decides #3", "Answering this lets claude-01 skip discovery".
   */
  stakes?: string;
  /** An earlier decision that may already answer it, asked anyway: "D-2 already decided: …". */
  precedent?: string;
  /**
   * High risk by the risk policy when it was asked: only the Lookout, and only someone allowed to make high-risk
   * calls, may answer it. A hint for the page, which routes it to them; the answer route checks again.
   */
  lookoutOnly?: true;
}
