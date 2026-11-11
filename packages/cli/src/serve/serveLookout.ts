import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slackPlugin } from '@teamtrail/connector-slack/node';
import { BRAND } from '@teamtrail/core';
import { writeLookoutLock, writeMcpEndpoint } from '@teamtrail/core/agents';
import { createProjectsHub, createTrackerBridge, type ProjectsHub } from '@teamtrail/core/bridge';
import { fail } from '../args/help';
import type { ServeOptions } from '../args/parseArgs';
import { createMcpHttp } from '../mcp/http/createMcpHttp';
import { endpointUrl } from '../mcp/http/endpointUrl';
import { remoteAgentOpener } from '../mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../mcp/http/tokenFileAuth';
import { printGreeting } from '../printGreeting';
import { agentVersionWarnings } from './agentVersionWarnings';
import { keepServing } from './keepServing';
import { listen } from './listen';
import { lookoutHandler } from './lookoutHandler';
import { openBrowser } from './openBrowser';

/** The default command: one process serving the lookout bundle and the tracker API, until Ctrl+C. */
export async function serveLookout(opts: ServeOptions, slackSetup: boolean) {
  const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
  if (!existsSync(path.join(appDir, 'index.html'))) fail(`Lookout bundle missing at ${appDir}; reinstall the package`);

  const root = path.resolve(process.cwd(), opts.dir);
  // Remote agents' tools over HTTP, for tokens created in Settings: closed until one exists, and on this port
  // for this machine only. The same port serves the bridge, which has no sign-in, so it is never the one to
  // share: agents elsewhere connect to `teamtrail mcp --http`.
  const mcp = createMcpHttp({
    auth: tokenFileAuth(root),
    open: remoteAgentOpener({ root, version: __VERSION__ }),
    thisMachineOnly: true,
  });
  let hub: ProjectsHub | undefined;
  const server = http.createServer(lookoutHandler({ appDir, mcp, hub: () => hub }));

  let port: number;
  try {
    port = await listen(server, opts.port, opts.host, opts.portExplicit ? 0 : 20);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    fail(e.code === 'EADDRINUSE' ? `port ${opts.port} is already in use; pick another with --port <n>` : e.message);
  }
  const shownHost = opts.host === '127.0.0.1' || opts.host === '0.0.0.0' ? 'localhost' : opts.host;
  const url = `http://${shownHost}:${port}/`;
  const bridge = createTrackerBridge(root, {
    plugins: [slackPlugin()],
    url: () => url,
  });
  // Other registered projects open on first use, at /p/<id>/…, with their own checkout for the GitHub origin; Slack stays with the home project.
  hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, { cwd: p.path, url: () => url }),
    url: () => url,
  });
  keepServing();
  printGreeting();
  process.stdout.write(
    `\n  ${BRAND.name} ${__VERSION__} · ${BRAND.assistant.name} online\n\n` +
      `  Lookout  ${url}\n` +
      `  Tracker         ${path.relative(process.cwd(), bridge.root) || '.'}${path.sep}  (${bridge.root})\n\n` +
      `  Press Ctrl+C to stop.\n\n`,
  );
  if (slackSetup) process.stdout.write(`  Slack setup     ${url}?settings=slack\n\n`);
  if (opts.open) openBrowser(slackSetup ? `${url}?settings=slack` : url);
  const unlock = writeLookoutLock(bridge.root, url);
  for (const w of await agentVersionWarnings(bridge.root, __VERSION__))
    process.stdout.write(`  Heads up        ${w}\n`);
  const unlist = writeMcpEndpoint(bridge.root, {
    url: endpointUrl('127.0.0.1', port),
    kind: 'lookout',
    network: false,
  });

  const stop = () => {
    unlock();
    unlist();
    void mcp.close();
    hub?.close();
    bridge.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
