import { isIPv6 } from 'node:net';

/** The eight groups of an IPv6 address, `::` expanded; a dotted IPv4 tail counts as two groups. */
function groups(addr: string) {
  const [head, tail] = addr.split('::');
  const part = (s: string | undefined) => (s ? s.split(':') : []);
  const width = (parts: string[]) => parts.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
  if (tail === undefined) return part(head);
  const h = part(head);
  const t = part(tail);
  return [...h, ...Array<string>(Math.max(0, 8 - width(h) - width(t))).fill('0'), ...t];
}

/**
 * The key rate limits count a client by: an IPv4 address as it is, an IPv6 address by its /64, since one
 * device or network commonly holds a whole /64 and could otherwise rotate through it.
 */
export function addressKey(address: string) {
  const bare = address.replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  if (mapped) return mapped[1];
  if (!isIPv6(bare)) return bare;
  const prefix = groups(bare.toLowerCase())
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}
