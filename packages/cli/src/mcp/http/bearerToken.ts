import type { IncomingMessage } from 'node:http';

/** The token of an `Authorization: Bearer <token>` header. Tokens are never read from the URL or the body. */
export function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  return /^Bearer +([\w.~+/=-]{1,256})$/i.exec(header.trim())?.[1];
}
