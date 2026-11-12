import type { IncomingMessage } from 'node:http';
import { LIMITS } from '../limits';

export class BodyTooLarge extends Error {}

/** The request body as text, refused past the size limit without reading the rest. */
export async function readBody(req: IncomingMessage, max: number = LIMITS.httpBodyBytes) {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > max) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
