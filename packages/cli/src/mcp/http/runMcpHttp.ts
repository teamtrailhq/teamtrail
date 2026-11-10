import http from 'node:http';
import { BRAND } from '@teamtrail/core';
import { remoteTokenViews, writeMcpEndpoint } from '@teamtrail/core/agents';
import { configDir } from '@teamtrail/core/bridge';
import { autoRegister } from '@teamtrail/core/node';
import { fail } from '../../args/help';
import { keepServing } from '../../serve/keepServing';
import { listen } from '../../serve/listen';
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
  const server = http.createServer(mcpHttpListener(mcp));
  // A small server with one job: slow or hoarded connections are cut early. Long tool waits are responses,
  // which these don't limit.
  server.maxConnections = 256;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  let port: number;
  try {
    port = await listen(server, opts.port, opts.host, opts.portExplicit ? 0 : 20);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    fail(e.code === 'EADDRINUSE' ? `port ${opts.port} is already in use; pick another with --port <n>` : e.message);
  }
  keepServing();
  const url = endpointUrl(opts.host, port);
  const network = !isLoopback(opts.host);
  const release = writeMcpEndpoint(opts.root, { url, kind: 'standalone', network });
  const tokens = remoteTokenViews(opts.root).length;
  const access = tokens
    ? `${tokens} token${tokens === 1 ? '' : 's'} can connect`
    : 'closed: no tokens yet. Create one in the Lookout: Settings → Remote agents';
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
      server.close(() => process.exit(0));
      server.closeAllConnections();
    });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
