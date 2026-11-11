import type http from 'node:http';

/** Listens `server` on `host:port`. Resolves the error the listen failed with, or undefined once it listens. */
export function bindServer(
  server: http.Server,
  port: number,
  host: string,
): Promise<NodeJS.ErrnoException | undefined> {
  return new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      resolve(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(undefined);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ port, host, exclusive: true });
  });
}
