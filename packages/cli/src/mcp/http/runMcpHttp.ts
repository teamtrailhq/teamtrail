import http from 'node:http';
import { BRAND } from '@teamtrail/core';
import { remoteTokenViews, writeMcpEndpoint } from '@teamtrail/core/agents';
import { configDir } from '@teamtrail/core/bridge';
import { autoRegister } from '@teamtrail/core/node';
import { fail } from '../../args/help';
import { canonicalHost } from '../../serve/canonicalHost';
import { keepServing } from '../../serve/keepServing';
import { listen, type Listening } from '../../serve/listen';
import { listenFailure } from '../../serve/listenFailure';
import { createMcpHttp } from './createMcpHttp';
import { endpointUrl, isLoopback } from './endpointUrl';
import { mcpHttpListener } from './mcpHttpListener';
import { remoteAgentOpener } from './remoteAgentOpener';
import { tokenFileAuth } from './tokenFileAuth';

export interface McpHttpServeOptions {
  root: string;
  host: string;
  port: number;
  portExplicit: boolean;
  allowHosts: string[];
  leaseMinutes?: number;
  noRegister?: boolean;
  version: string;
}

/**
 * `teamtrail mcp --http`: the MCP tools over streamable HTTP for this repo, and nothing else on the port (no
 * Lookout, no bridge), until Ctrl+C. It's the server to put behind TLS or a tunnel for agents on other machines.
 */
export async function runMcpHttp(opts: McpHttpServeOptions) {
  autoRegister({ configDir: configDir(), root: opts.root, optOut: opts.noRegister });
  const mcp = createMcpHttp({
    auth: tokenFileAuth(opts.root),
    open: remoteAgentOpener({ root: opts.root, version: opts.version, leaseMinutes: opts.leaseMinutes }),
    allowedHosts: opts.allowHosts,
  });
  const listener = mcpHttpListener(mcp);
  // A small server with one job: slow or hoarded connections are cut early. Long tool waits are responses,
  // which these don't limit. One per address: the --host one, 127.0.0.1 and ::1 (serve/listen.ts).
  const make = () => {
    const server = http.createServer(listener);
    server.maxConnections = 256;
    server.headersTimeout = 10_000;
    server.requestTimeout = 30_000;
    return server;
  };
  let listening: Listening;
  try {
    listening = await listen({ make, port: opts.port, host: opts.host, retries: opts.portExplicit ? 0 : 20 });
  } catch (err) {
    fail(listenFailure(err));
  }
  const { port, servers, addresses } = listening;
  keepServing();
  // listen() refused a --host that isn't an IP address; this is the spelling it bound.
  const host = canonicalHost(opts.host) ?? opts.host;
  const url = endpointUrl(host, port, addresses);
  const network = !isLoopback(host);
  const release = writeMcpEndpoint(opts.root, { url, kind: 'standalone', network });
  const tokens = remoteTokenViews(opts.root).length;
  const access = tokens
    ? `${tokens} token${tokens === 1 ? '' : 's'} can connect`
    : 'closed: no tokens yet. Create one in the Lookout: Settings → Project → Remote agents';
  const exposure = network
    ? '  Open to your network over plain HTTP. Put it behind TLS or a tunnel before agents elsewhere use it.\n'
    : `  This machine only. Other machines: a tunnel to this port, or --host <addr> behind TLS.\n`;
  process.stderr.write(
    `\n  ${BRAND.name} ${opts.version} · MCP over HTTP\n\n` +
      `  Endpoint  ${url}\n` +
      `  Tracker   ${opts.root}\n` +
      `  Access    ${access}\n\n${exposure}\n  Press Ctrl+C to stop.\n\n`,
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    release();
    void mcp.close().finally(() => {
      let open = servers.length;
      for (const server of servers) {
        server.close(() => --open || process.exit(0));
        server.closeAllConnections();
      }
    });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
