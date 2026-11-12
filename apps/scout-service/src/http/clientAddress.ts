import type { IncomingMessage } from 'node:http';
import { addressKey } from './addressKey';

/**
 * Who is calling, for rate limits: the socket's address, or behind a trusted proxy (Railway) the address it
 * appended last to `X-Forwarded-For`, the one a client can't choose. IPv6 clients count by their /64.
 */
export function clientAddress(req: IncomingMessage, trustProxy: boolean) {
  const socket = req.socket.remoteAddress ?? 'unknown';
  if (!trustProxy) return addressKey(socket);
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return addressKey(forwarded.at(-1) ?? socket);
}
