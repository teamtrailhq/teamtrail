import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Who a token belongs to: one agent, by the id and name its token was created with. */
export interface McpPrincipal {
  id: string;
  name: string;
}

/**
 * How the HTTP layer checks tokens. Locally that is the repo's token file (`tokenFileAuth.ts`); a hosted
 * workspace brings its own.
 */
export interface McpHttpAuth {
  /** The agent a presented token belongs to; undefined for anything else (unknown, revoked, no tokens at all). */
  authenticate(token: string): McpPrincipal | undefined | Promise<McpPrincipal | undefined>;
  /** Whether the agent's token is still valid; asked about every live session, about once a second. */
  live(principal: McpPrincipal): boolean;
  /** Told when a request carried the token, for "last used". */
  used?(principal: McpPrincipal): void;
}

/** One MCP session's server side: the tools, and what to tear down when the session ends. */
export interface McpHosted {
  server: McpServer;
  close(reason: string): void;
}

export interface McpHttpOptions {
  auth: McpHttpAuth;
  /** Builds the MCP server for a new session of this agent. Every session is its own agent session. */
  open(principal: McpPrincipal): McpHosted | Promise<McpHosted>;
  /** Host names requests may be addressed to, besides localhost and IP addresses (a tunnel's or proxy's name). */
  allowedHosts?: string[];
  /** Interval of the keep-alive comments on open streams, so proxies and client timeouts leave long waits alone. */
  keepAliveMs?: number;
  /** A session with no request in flight for this long is closed (the client went away without saying so). */
  idleMs?: number;
  /** How often sessions are checked for a revoked token or idleness. */
  sweepMs?: number;
  /** Live sessions at most; further initializations are refused until one ends. */
  maxSessions?: number;
}

/** The mountable endpoint: give it every request addressed to the MCP path. */
export interface McpHttp {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Live sessions, for tests and status lines. */
  sessionCount(): number;
  /** Ends every session. */
  close(): Promise<void>;
}
