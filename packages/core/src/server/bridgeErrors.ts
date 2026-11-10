import type { ServerResponse } from 'node:http';
import { AnswerError } from '../agents/agentDocs';
import { BadRequest, sendFailure, sendJson, TooLarge } from './http';
import { sendTrackerError } from './trackerErrors';

/** How the bridge and the projects hub answer what a route threw: the refusals routes mean, else a generic failure. */
export function sendBridgeError(res: ServerResponse, err: unknown) {
  if (res.headersSent) return sendFailure(res, err);
  if (err instanceof TooLarge) return sendFailure(res, err);
  if (err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
  if (err instanceof AnswerError) return sendJson(res, 409, { error: err.message });
  if (sendTrackerError(res, err)) return;
  sendFailure(res, err);
}
