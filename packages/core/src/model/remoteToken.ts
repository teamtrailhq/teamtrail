/**
 * A remote agent's access to the MCP endpoint over HTTP (`teamtrail mcp --http`, or `/mcp` on the Lookout).
 * One token per agent, created and revoked by the trail lead in Settings → Project → Remote agents. Only the SHA-256 of the
 * token is kept; the token itself is shown once, when it's created.
 */
export interface RemoteToken {
  /** Stable id (`rt_…`), safe to show and to journal. */
  id: string;
  /** The trail lead's name for the agent that holds it. */
  name: string;
  /** SHA-256 of the token, hex. */
  hash: string;
  createdAt: number;
}

/** A token as the Lookout lists it: never its hash. */
export interface RemoteTokenView {
  id: string;
  name: string;
  createdAt: number;
  /** When a request last carried it, to the minute. */
  lastUsedAt?: number;
}

/** A running MCP endpoint for this tracker folder, as the process serving it reports it. */
export interface McpEndpoint {
  url: string;
  pid: number;
  /** `lookout`: the Lookout's own port; `standalone`: `teamtrail mcp --http`, which serves nothing else. */
  kind: 'lookout' | 'standalone';
  /** Bound beyond this machine (not a loopback address). */
  network: boolean;
  startedAt: number;
}
