import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LEASE_MINUTES_ENV, leaseMs, MarkdownAdapter } from '@teamtrail/core';
import { activeTracker } from '@teamtrail/core/bridge';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { TrailAgent } from '../agent';
import { createMcpServer } from '../server';
import type { AgentOptions } from '../trail/types';
import type { McpHosted, McpPrincipal } from './types';

/**
 * What an HTTP session serves for a repo: its own agent, exactly like one `teamtrail mcp` process over stdio
 * (own session doc, leases and questions under the same tracker folder), marked remote. Usage is not read
 * from local agent logs: a remote agent's logs are not on this machine, so the numbers it reports count.
 */
export function remoteAgentOpener(o: {
  root: string;
  version: string;
  leaseMinutes?: number;
  agent?: Pick<AgentOptions, 'pollMs' | 'leaseMs'>;
}) {
  return (principal: McpPrincipal): McpHosted => {
    let server: McpServer | undefined;
    const client = () => {
      const v = server?.server.getClientVersion();
      return v ? `${v.name} ${v.version}` : undefined;
    };
    const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(o.root), watch: undefined }, o.root);
    const agent = new TrailAgent({
      root: o.root,
      client,
      tracker: activeTracker({ root: o.root, markdown }),
      leaseMs: leaseMs(o.leaseMinutes ?? process.env[LEASE_MINUTES_ENV]),
      ...o.agent,
      remote: { tokenName: principal.name, tokenId: principal.id },
    });
    server = createMcpServer(agent, o.version);
    return { server, close: (reason) => agent.close(reason) };
  };
}
