import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PeerAddress } from '@teamtrail/core/bridge';

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
  /**
   * The tokens as they are now, read once: the returned function says whether an agent's token is still valid.
   * Asked about once a second, then applied to every live session.
   */
  snapshot(): (principal: McpPrincipal) => boolean;
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
  /**
   * Answer only connections from this machine. The Lookout mounts the endpoint this way: its port also serves
   * the bridge, which has no sign-in, so that port is never the one to share.
   */
  thisMachineOnly?: boolean;
  /** Who is on the other end of a connection; default the socket's remote address. Tests stand in another device. */
  peer?: PeerAddress;
  /** Interval of the keep-alive comments on open streams, so proxies and client timeouts leave long waits alone. */
  keepAliveMs?: number;
  /**
   * A session with no call in flight for this long is closed (the client went away without saying so). An open
   * notification stream is not a call: holding one open keeps nothing alive.
   */
  idleMs?: number;
  /** How often sessions are checked for a revoked token or idleness. */
  sweepMs?: number;
  /** Live sessions at most; further initializations are refused until one ends. */
  maxSessions?: number;
  /** Live sessions one token may hold. One more closes that token's longest-idle session, or is refused when none is idle. */
  maxSessionsPerToken?: number;
}

/** The mountable endpoint: give it every request addressed to the MCP path. */
export interface McpHttp {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Live sessions, for tests and status lines. */
  sessionCount(): number;
  /** Ends every session. */
  close(): Promise<void>;
}
