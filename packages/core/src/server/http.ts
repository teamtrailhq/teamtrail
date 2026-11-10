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

export async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** The request body as JSON; `empty` stands in for an empty body. */
export async function readJson<T>(req: IncomingMessage, empty?: string): Promise<T> {
  const text = await readText(req);
  try {
    return JSON.parse(empty === undefined ? text : text || empty) as T;
  } catch {
    throw new BadRequest('body must be JSON');
  }
}

/** Starts a server-sent events response. */
export function openEventStream(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': ok\n\n');
}
