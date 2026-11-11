import os from 'node:os';

/** The path the MCP endpoint is served at, on the Lookout's port and on `teamtrail mcp --http`. */
export const MCP_PATH = '/mcp';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const WILDCARD = new Set(['0.0.0.0', '::']);

/** Bound to this machine only. */
export const isLoopback = (host: string) => LOOPBACK.has(host);

/** This machine's first address other machines can reach, for a server bound to every interface. */
function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flatMap((list) => list ?? []);
  return all.find((a) => a.family === 'IPv4' && !a.internal)?.address;
}

/**
 * The endpoint's URL as a client should type it: `127.0.0.1` for loopback, a reachable address otherwise. Never
 * `localhost`, which a client may resolve to `::1` first: an IP address is one socket, the one the server holds.
 */
export function endpointUrl(host: string, port: number) {
  let shown = host;
  if (isLoopback(host)) shown = '127.0.0.1';
  else if (WILDCARD.has(host)) shown = lanAddress() ?? '127.0.0.1';
  if (shown.includes(':')) shown = `[${shown}]`;
  return `http://${shown}:${port}${MCP_PATH}`;
}
