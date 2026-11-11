import net from 'node:net';
import type { Plugin, ViteDevServer } from 'vite';

const NO_SUCH_ADDRESS = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

/**
 * Holds `[::1]:<port>` beside the dev server's `127.0.0.1:<port>`, so no other local program can listen there and
 * take the dev page's `localhost` origin (Chrome tries `::1` first). The page is served and printed on 127.0.0.1
 * only; this socket answers nothing and closes every connection. Another program already holding it stops the dev
 * server: like the CLI (packages/cli/src/serve/listen.ts), it never starts beside a squatter. Skipped quietly where
 * this machine has no IPv6 loopback.
 */
export function holdIpv6Loopback(): Plugin {
  return {
    name: 'hold-ipv6-loopback',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const holder = net.createServer((socket) => socket.destroy());
      holder.on('error', (err: NodeJS.ErrnoException) => {
        if (NO_SUCH_ADDRESS.has(err.code ?? '')) return;
        server.config.logger.error(`  [::1] port is held by another program (${err.code}); not serving beside it.`);
        process.exit(1);
      });
      server.httpServer?.once('listening', () => {
        const { port } = server.httpServer!.address() as { port: number };
        holder.listen({ port, host: '::1', exclusive: true });
      });
      server.httpServer?.on('close', () => holder.close());
    },
  };
}
