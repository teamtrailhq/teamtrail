import type { IncomingMessage, ServerResponse } from 'node:http';

/** A request the route refuses; answered with 400 and the message. */
export class BadRequest extends Error {}

export function sendJson(res: ServerResponse, status: number, v: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(v));
}

/**
 * Refuses a request before its body is read (a guard said no). The connection is closed with it, so an unread
 * body can never be taken for the start of the next request.
 */
export function refuseEarly(res: ServerResponse, v: unknown) {
  res.setHeader('Connection', 'close');
  sendJson(res, 403, v);
}

/**
 * The request's URL: the one parser every server uses. Only an origin-form target is a request (`/path?query`):
 * `//` (which no URL parser accepts), `///x`, an absolute-form `http://other/x` and `*` are refused with 400
 * like any other bad request. It must never throw past the listener, where it would end the process.
 */
export function requestUrl(req: IncomingMessage): URL {
  const target = req.url ?? '/';
  if (!target.startsWith('/') || target.startsWith('//')) throw new BadRequest('malformed request');
  try {
    return new URL(target, 'http://x');
  } catch {
    throw new BadRequest('malformed request');
  }
}

/**
 * The answer to a failure no route expected: 400 for a malformed request, else a plain 500. Never the error's
 * text, which can carry an absolute path (`ENOENT … open '/Users/…'`); that goes to this process's stderr.
 */
export function sendFailure(res: ServerResponse, err: unknown) {
  const bad = err instanceof BadRequest || err instanceof URIError;
  if (!bad) console.error(err);
  if (res.headersSent || res.writableEnded) return void res.destroy();
  res.setHeader('Connection', 'close');
  if (err instanceof TooLarge) return sendJson(res, 413, { error: err.message });
  if (err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
  sendJson(res, bad ? 400 : 500, { error: bad ? 'malformed request' : 'Internal error' });
}

/** The largest request body any route reads: a ticket file with long comments fits many times over. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** A body past MAX_BODY_BYTES; answered with 413 and the connection closed, before the rest is read. */
export class TooLarge extends BadRequest {}

export async function readText(req: IncomingMessage): Promise<string> {
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) throw new TooLarge('request body too large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new TooLarge('request body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The request body as JSON; `empty` stands in for an empty body. */
export async function readJson<T>(req: IncomingMessage, empty?: string): Promise<T> {
  const text = await readText(req);
  let body: unknown;
  try {
    body = JSON.parse(empty === undefined ? text : text || empty);
  } catch {
    throw new BadRequest('body must be JSON');
  }
  // Routes read fields off the body; `null` would throw in every one of them.
  if (body === null) throw new BadRequest('body must be JSON');
  return body as T;
}

/** Starts a server-sent events response. */
export function openEventStream(res: ServerResponse) {
  // Set one by one, so a wrapper of this response (redactResponse) can read the type back.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.writeHead(200);
  res.write(': ok\n\n');
}
