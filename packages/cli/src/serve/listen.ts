import type http from 'node:http';
import { bindServer } from './bindServer';
import { canonicalHost } from './canonicalHost';
import { listenAddresses } from './listenAddresses';

const NO_SUCH_ADDRESS = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

export interface Listening {
  port: number;
  servers: http.Server[];
  /** The addresses held on `port`, the only ones to hand out. */
  addresses: string[];
}

interface ListenOptions {
  make: () => http.Server;
  port: number;
  host: string;
  retries: number;
  draws?: number;
}

type Attempt = { kind: 'ok'; listening: Listening } | { kind: 'failed'; error: NodeJS.ErrnoException };

const closeAll = (servers: http.Server[]) => servers.forEach((s) => s.close());

/** Listens on every address for `host` on one port, or on none of them. */
async function attempt(make: () => http.Server, host: string, port: number): Promise<Attempt> {
  let bound = port;
  const servers: http.Server[] = [];
  const addresses: string[] = [];
  for (const a of listenAddresses(host)) {
    const server = make();
    const error = await bindServer(server, bound, a.host);
    if (error && a.optional && NO_SUCH_ADDRESS.has(error.code ?? '')) continue;
    if (error) {
      closeAll(servers);
      return { kind: 'failed', error };
    }
    bound = (server.address() as { port: number }).port;
    servers.push(server);
    addresses.push(a.host);
  }
  return { kind: 'ok', listening: { port: bound, servers, addresses } };
}

/**
 * Listens on `port` with one server per address (listenAddresses.ts), all made by `make` with the same handler:
 * the `--host` address, or each interface address for a wildcard, and 127.0.0.1 and ::1 always. Each socket is its
 * own exact address, so no other local program can listen beside it and take its traffic. Another program holding
 * the port on any of them is EADDRINUSE, naming that address: the next port is tried up to `retries` times, then
 * the error is thrown, never a partial listen.
 */
export async function listen(o: ListenOptions): Promise<Listening> {
  const host = canonicalHost(o.host);
  if (!host)
    throw new Error(`--host must be an IP address (127.0.0.1, 0.0.0.0, ::, or one of this machine's), not "${o.host}"`);
  const result = await attempt(o.make, host, o.port);
  if (result.kind === 'ok') return result.listening;
  if (result.error.code !== 'EADDRINUSE') throw result.error;
  // Port 0: the port the first address got may be another program's on a later one; draw again a few times.
  const draws = o.draws ?? 5;
  if (o.port === 0 && draws > 0) return listen({ ...o, draws: draws - 1 });
  if (o.port !== 0 && o.retries > 0) return listen({ ...o, port: o.port + 1, retries: o.retries - 1 });
  throw result.error;
}
