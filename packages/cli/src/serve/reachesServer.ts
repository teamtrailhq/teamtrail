import type http from 'node:http';
import net from 'node:net';

/**
 * Whether a connection to `host:port` arrives at `server` itself, not at another program's socket: the server sees
 * a connection from exactly the client's local port. Used when the system refuses a loopback bind because our own
 * wildcard listener already covers it (Linux does; macOS lets a more specific socket in beside it).
 */
export function reachesServer(server: http.Server, host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const seen = new Set<number | undefined>();
    const client = net.connect({ host, port });
    const done = (ok: boolean) => {
      clearTimeout(timer);
      server.off('connection', onConnection);
      client.destroy();
      resolve(ok);
    };
    const onConnection = (socket: net.Socket) => {
      seen.add(socket.remotePort);
      if (client.localPort !== undefined && socket.remotePort === client.localPort) done(true);
    };
    const timer = setTimeout(() => done(false), 1500);
    server.on('connection', onConnection);
    // Our own server sees its side of the connection at once; a moment later it never will.
    client.once('connect', () => {
      if (seen.has(client.localPort)) done(true);
      else setTimeout(() => done(seen.has(client.localPort)), 200);
    });
    client.once('error', () => done(false));
  });
}
