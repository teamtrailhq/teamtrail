import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BRAND, LEASE_MINUTES_ENV, leaseMs, MarkdownAdapter } from '@teamtrail/core';
import { activeTracker, configDir } from '@teamtrail/core/bridge';
import { autoRegister, nodeMarkdownFs } from '@teamtrail/core/node';
import { UsageMeter } from '../usage/meter';
import { TrailAgent } from './agent';
import { INSTRUCTIONS } from './instructions';
import { refuseHumanTools } from './remoteGate';
import { toolDefiner } from './toolKit';
import { registerGuideTools } from './tools/guideTools';
import { registerHitlTools } from './tools/hitlTools';
import { registerKnowledgeTools } from './tools/knowledgeTools';
import { registerProjectTools } from './tools/projectTools';
import { registerRerouteTools } from './tools/rerouteTools';
import { registerTicketTools } from './tools/ticketTools';
import { registerTrailTools } from './tools/trailTools';
import { registerWorkTools } from './tools/workTools';

export function createMcpServer(agent: TrailAgent, version: string) {
  const server = new McpServer({ name: BRAND.slug, title: BRAND.name, version }, { instructions: INSTRUCTIONS });
  const tool = toolDefiner(server, agent);
  registerTrailTools(tool, agent);
  registerTicketTools(tool, agent);
  registerWorkTools(tool, agent);
  registerHitlTools(tool, agent);
  registerKnowledgeTools(tool, agent);
  registerRerouteTools(tool, agent);
  registerGuideTools(tool, agent);
  registerProjectTools(tool, agent);
  if (agent.remote) refuseHumanTools(server);
  return server;
}

/** `teamtrail mcp`: serve the agent over stdio until the client disconnects. */
export async function runMcpServer(opts: {
  root: string;
  agent?: string;
  leaseMinutes?: number;
  noRegister?: boolean;
  version: string;
}) {
  // The Lookout's All projects view lists this repo from now on (opt out: --no-register).
  autoRegister({ configDir: configDir(), root: opts.root, optOut: opts.noRegister });
  let server: McpServer | undefined;
  const client = () => {
    const v = server?.server.getClientVersion();
    return v ? `${v.name} ${v.version}` : undefined;
  };
  const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(opts.root), watch: undefined }, opts.root);
  const agent = new TrailAgent({
    root: opts.root,
    agent: opts.agent,
    client,
    tracker: activeTracker({ root: opts.root, markdown }),
    usage: new UsageMeter({ root: opts.root }),
    leaseMs: leaseMs(opts.leaseMinutes ?? process.env[LEASE_MINUTES_ENV]),
  });
  server = createMcpServer(agent, opts.version);
  let closed = false;
  const shutdown = (code = 0) => {
    if (closed) return;
    closed = true;
    agent.close();
    void server!.close().finally(() => process.exit(code));
  };
  const transport = new StdioServerTransport();
  transport.onclose = () => shutdown();
  process.stdin.on('end', () => shutdown());
  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
  await server.connect(transport);
  process.stderr.write(`${BRAND.slug} mcp · tracker ${opts.root}\n`);
}
