import { isIPv6 } from 'node:net';

/** An IPv6 address's eight groups, `::` expanded. */
function groups(address: string): string[] {
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = address.includes('::') ? new Array<string>(8 - left.length - right.length).fill('0') : [];
  return [...left, ...fill, ...right].map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
}

/**
 * Who a caller is for the wrong-code budget. Loopback is one caller. An IPv4 address is itself (written either
 * way); an IPv6 address counts as its /64, since one device usually holds a whole /64 and can pick any address in it.
 */
export function callerKey(who: string): string {
  if (who === 'loopback') return who;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(who);
  if (v4) return v4[1];
  const bare = who.replace(/%.*$/, '');
  return isIPv6(bare) ? `${groups(bare).slice(0, 4).join(':')}::/64` : who;
}
