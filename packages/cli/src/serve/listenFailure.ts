/**
 * What a failed listen tells the person: a port another program holds on any address the server needs (it holds
 * 127.0.0.1 and ::1 too, so nothing can take its address beside it) is named with that address.
 */
export function listenFailure(err: unknown) {
  const e = err as NodeJS.ErrnoException & { address?: string; port?: number };
  if (e.code !== 'EADDRINUSE') return e.message;
  const where = e.address ? ` on ${e.address}` : '';
  return `port ${e.port} is already in use${where} by another program; pick another with --port <n>`;
}
