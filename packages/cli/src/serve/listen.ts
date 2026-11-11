import type http from 'node:http';
import { bindServer } from './bindServer';
import { reachesServer } from './reachesServer';

/** Every loopback address the port is held on, besides the one asked for; `::1` only where this machine has it. */
const LOOPBACKS = [
  { host: '127.0.0.1', optional: false },
  { host: '::1', optional: true },
];
const NO_SUCH_ADDRESS = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);
const ALIASES: Record<string, string> = { localhost: '127.0.0.1', '[::1]': '::1' };

export interface Listening {
  port: number;
  servers: http.Server[];
}

type Attempt = { kind: 'ok'; listening: Listening } | { kind: 'failed'; error: NodeJS.ErrnoException };

const closeAll = (servers: http.Server[]) => servers.forEach((s) => s.close());

/** One loopback address held beside `main`; the error when another program holds it. */
async function holdLoopback(o: { main: http.Server; make: () => http.Server; host: string; port: number }) {
  const extra = o.make();
  const error = await bindServer(extra, o.port, o.host);
  if (!error) return { server: extra };
  const ours = error.code === 'EADDRINUSE' && (await reachesServer(o.main, o.host, o.port));
  return ours ? {} : { error };
}

/** Listens on `host` and every loopback address on one port, or on none of them. */
async function attempt(make: () => http.Server, host: string, port: number): Promise<Attempt> {
  const main = make();
  const mainError = await bindServer(main, port, host);
  if (mainError) return { kind: 'failed', error: mainError };
  const bound = (main.address() as { port: number }).port;
  const servers = [main];
  for (const lb of LOOPBACKS.filter((l) => l.host !== host)) {
    const held = await holdLoopback({ main, make, host: lb.host, port: bound });
    if (held.server) servers.push(held.server);
    if (!held.error || (lb.optional && NO_SUCH_ADDRESS.has(held.error.code ?? ''))) continue;
    closeAll(servers);
    return { kind: 'failed', error: held.error };
  }
  return { kind: 'ok', listening: { port: bound, servers } };
}

/**
 * Listens on `port` on `host` and, with it, on 127.0.0.1 and ::1: one server per address, all made by `make` with
 * the same handler. Holding every loopback socket is what keeps another local program from taking the Lookout's
 * address beside it (Chrome tries `::1` first for `localhost`; macOS lets a specific address in beside a wildcard).
 * A port held by someone else on any of them is EADDRINUSE: the next port is tried up to `retries` times, then the
 * error is thrown, never a partial listen. `::1` is skipped where this machine has no IPv6 loopback.
 */
export async function listen(o: { make: () => http.Server; port: number; host: string; retries: number }) {
  const host = ALIASES[o.host] ?? o.host;
  const result = await attempt(o.make, host, o.port);
  if (result.kind === 'ok') return result.listening;
  const again = result.error.code === 'EADDRINUSE' && o.retries > 0 && o.port !== 0;
  if (again) return listen({ ...o, port: o.port + 1, retries: o.retries - 1 });
  throw result.error;
}
