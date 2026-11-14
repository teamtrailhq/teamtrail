import type { IncomingMessage } from 'node:http';
import type { AnswerVia } from '../model/answerVia';
import { markedLimited } from './limitedRequests';

/**
 * How the human's word given through this request counts: `lookout`, or `lookout-limited` for a caller the hub
 * marked as not allowed high-risk calls (limitedRequests.ts). Every Lookout route that records an answer, an
 * approval or a decision labels it with this, whatever the body says.
 */
export const lookoutVia = (req: IncomingMessage): AnswerVia => (markedLimited(req) ? 'lookout-limited' : 'lookout');
