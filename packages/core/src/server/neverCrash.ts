import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendFailure } from './http';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

/**
 * The one top-level guard of an HTTP entry point (the Lookout's port, the bridge, the projects hub,
 * `teamtrail mcp --http`, the dev plugin): whatever `handle` throws or rejects with, now or later, the request
 * gets a generic 400 or 500 and the process keeps serving. Nothing a request carries may end the process.
 */
export function neverCrash(handle: Handler, fail: typeof sendFailure = sendFailure) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handle(req, res);
    } catch (err) {
      try {
        fail(res, err);
      } catch {
        res.destroy();
      }
    }
  };
}
