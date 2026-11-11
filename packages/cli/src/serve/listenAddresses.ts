import os from 'node:os';

export interface ListenAddress {
  host: string;
  /** Skipped when the machine doesn't have it (EADDRNOTAVAIL): `::1` without IPv6, an interface going away. */
  optional: boolean;
}

const ALIASES: Record<string, string> = { localhost: '127.0.0.1', '[::1]': '::1' };
const WILDCARDS = new Set(['0.0.0.0', '::']);

/** This machine's interface addresses now: IPv4, plus IPv6 for `::` (not link-local, which needs a scope). */
function interfaceAddresses(ipv6: boolean) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => !!a && (a.family === 'IPv4' || (ipv6 && a.family === 'IPv6' && !a.address.startsWith('fe80:'))))
    .map((a) => a!.address);
}

/**
 * Every address a server for `--host <host>` listens on, one socket each: never a wildcard, which another program
 * could sit beside on a more specific address (macOS allows it) and take that address's traffic. `0.0.0.0` (and
 * `::`, with IPv6) is every interface address the machine has at start: one that appears later isn't served until
 * a restart. 127.0.0.1 and ::1 are always held, so nothing can take the address the Lookout hands out.
 */
export function listenAddresses(host: string): ListenAddress[] {
  const given = ALIASES[host] ?? host;
  const wanted = WILDCARDS.has(given) ? interfaceAddresses(given === '::') : [given];
  const required = new Set([...wanted.filter((h) => !WILDCARDS.has(given) || h === '127.0.0.1'), '127.0.0.1']);
  const all = [...new Set([...wanted, '127.0.0.1', '::1'])];
  return all.map((h) => ({ host: h, optional: !required.has(h) }));
}
