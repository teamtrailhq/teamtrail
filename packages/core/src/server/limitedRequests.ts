import type { IncomingMessage } from 'node:http';

const limited = new WeakSet<IncomingMessage>();

/**
 * Marks a request as from a caller not allowed high-risk calls: the projects hub does this when an embedding server's
 * sign-in says so (signIn/externalSignIn.ts `highRisk: false`). What such a caller does in the Lookout counts at every
 * gate but the high-risk ones, as a Slack answer does (model/answerVia.ts `lookout-limited`).
 */
export const markLimited = (req: IncomingMessage) => void limited.add(req);

/** Whether the hub marked this request as from a caller not allowed high-risk calls. */
export const markedLimited = (req: IncomingMessage) => limited.has(req);
