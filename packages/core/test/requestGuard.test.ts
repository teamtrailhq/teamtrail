import type { IncomingMessage } from 'node:http';
import { expect, test } from 'vitest';
import { requestRefusal } from '../src/server/requestGuard';

const req = (host: string, origin?: string) =>
  ({ headers: { host, ...(origin === undefined ? {} : { origin }) }, socket: {} }) as unknown as IncomingMessage;

// `mcp --http` behind a TLS-terminating proxy sees plain HTTP, while a browser-based client there sends
// `Origin: https://<host>`. For a name given with --allow-host that origin is the server's own.
test('an allowed host name may arrive with its https origin; nothing else changes', () => {
  const allow = ['mcp.example.com'];
  expect(requestRefusal(req('mcp.example.com', 'https://mcp.example.com'), allow)).toBeUndefined();
  expect(requestRefusal(req('mcp.example.com:8443', 'https://mcp.example.com:8443'), allow)).toBeUndefined();
  expect(requestRefusal(req('mcp.example.com', 'http://mcp.example.com'), allow)).toBeUndefined();
  expect(requestRefusal(req('MCP.example.com', 'https://mcp.EXAMPLE.com'), allow)).toBeUndefined();
  // the host must match exactly: no other name, no subdomain, no other port
  for (const origin of ['https://evil.example', 'https://x.mcp.example.com', 'https://mcp.example.com:444', 'null'])
    expect(requestRefusal(req('mcp.example.com', origin), allow)).toBe('Origin not allowed.');
  // a name nobody allowed is still refused outright, and IPs and localhost keep the strict rule
  expect(requestRefusal(req('mcp.example.com', 'https://mcp.example.com'))).toMatch(/Host not allowed/);
  expect(requestRefusal(req('127.0.0.1:7421', 'https://127.0.0.1:7421'), allow)).toBe('Origin not allowed.');
  expect(requestRefusal(req('localhost:7421', 'https://localhost:7421'), ['localhost'])).toBe('Origin not allowed.');
  expect(requestRefusal(req('127.0.0.1:7421', 'http://127.0.0.1:7421'), allow)).toBeUndefined();
});
