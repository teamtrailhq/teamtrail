import net from 'node:net';

const V4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/** `::ffff:7f00:1` as the IPv4 address it maps (`127.0.0.1`). */
function unmapped(v6: string) {
  const m = V4_MAPPED.exec(v6);
  if (!m) return v6;
  const [hi, lo] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16)];
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}

/**
 * `--host` as the one spelling the servers use, or undefined when it isn't an IP address. A name is refused: it
 * would bind one of its addresses and hand out the name, which the request guard refuses anyway. The literal is
 * parsed as the browser does (WHATWG URL), so every spelling of an address lands on one form: `0` and `0.0.0.0` are `0.0.0.0`,
 * `::0` and `0:0:0:0:0:0:0:0` are `::`, `::ffff:127.0.0.1` is `127.0.0.1`.
 */
export function canonicalHost(host: string): string | undefined {
  const bare = host.replace(/^\[(.*)\]$/, '$1');
  // an IP literal, or `0` (all zeros, as `ping 0` reads it); not the legacy forms URL also takes (`1.2.3`, `0x7f.1`)
  if (!net.isIP(bare) && bare !== '0') return undefined;
  const literal = bare.includes(':') ? `[${bare}]` : bare;
  let parsed: string;
  try {
    parsed = new URL(`http://${literal}/`).hostname.replace(/^\[(.*)\]$/, '$1');
  } catch {
    return undefined;
  }
  const address = unmapped(parsed);
  return net.isIP(address) ? address : undefined;
}
