import type { ClientMessage } from '../types';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const METHOD = /^[a-z]+\.[A-Za-z.]+$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A message from a linked Teamtrail, or undefined when it isn't one of the three it may send. */
export function parseClientMessage(text: string): ClientMessage | undefined {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(m)) return undefined;
  switch (m.type) {
    case 'hello':
      return typeof m.token === 'string' && m.token.length <= 128 ? { type: 'hello', token: m.token } : undefined;
    case 'call': {
      const valid = typeof m.id === 'string' && ID.test(m.id) && typeof m.method === 'string' && METHOD.test(m.method);
      if (!valid) return undefined;
      const args = isRecord(m.args) ? m.args : undefined;
      return { type: 'call', id: m.id as string, method: m.method as string, args };
    }
    case 'ack':
      return typeof m.id === 'string' && ID.test(m.id) ? { type: 'ack', id: m.id, ack: m.ack } : undefined;
    default:
      return undefined;
  }
}
