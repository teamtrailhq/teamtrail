import type { ServerResponse } from 'node:http';

/** A JSON-RPC error with an HTTP status, as MCP clients expect from the endpoint itself. */
export function refuse(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) {
  if (res.headersSent) return void res.end();
  // A refusal comes before the body is read: the connection goes with it, so the body can't be read as a request.
  const close = status >= 400 ? { Connection: 'close' } : {};
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...close, ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}
