import { lanUrls } from '../../serve/lanUrls';

/** The path the MCP endpoint is served at, on the Lookout's port and on `teamtrail mcp --http`. */
export const MCP_PATH = '/mcp';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const WILDCARD = new Set(['0.0.0.0', '::']);

/** Bound to this machine only. */
export const isLoopback = (host: string) => LOOPBACK.has(host);

/**
 * The endpoint's URL as a client should type it: `127.0.0.1` for loopback, a reachable address otherwise. Never
 * `localhost`, which a client may resolve to `::1` first: an IP address is one socket, the one the server holds.
 * For a wildcard `--host`, the first network address it actually holds (`held`, serve/listen.ts).
 */
export function endpointUrl(host: string, port: number, held: string[] = []) {
  if (WILDCARD.has(host)) {
    const lan = lanUrls(held, port)[0]?.replace(/\/$/, '');
    return `${lan ?? `http://127.0.0.1:${port}`}${MCP_PATH}`;
  }
  let shown = host;
  if (isLoopback(host)) shown = '127.0.0.1';
  if (shown.includes(':')) shown = `[${shown}]`;
  return `http://${shown}:${port}${MCP_PATH}`;
}
