/** Hosts that are this machine by name; any other host must be one of its addresses. */
const HERE = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * An MCP endpoint's URL as Teamtrail itself writes one: `http://<host>:<port>/mcp`, nothing else. The files
 * that announce endpoints are in `.agents/`, which local agents can write, and their URL ends up in a command
 * the human copies to another machine. So it is only believed when it is plain: no credentials, query or
 * fragment, no character a shell reads, and a host that is this machine (`addresses`: its own IP addresses).
 * Returns the URL normalised, or undefined.
 */
export function ownEndpointUrl(raw: unknown, addresses: string[]): string | undefined {
  if (typeof raw !== 'string' || raw.length > 200 || !/^[A-Za-z0-9.:/[\]-]+$/.test(raw)) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash) return undefined;
  if (url.pathname !== '/mcp' || !url.port) return undefined;
  const host = url.hostname.toLowerCase();
  const mine = HERE.has(host) || addresses.includes(host.replace(/^\[|\]$/g, ''));
  return mine && url.href === raw ? raw : undefined;
}
