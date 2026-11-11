import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slackPlugin } from '@teamtrail/connector-slack/node';
import { BRAND } from '@teamtrail/core';
import { writeLookoutLock, writeMcpEndpoint } from '@teamtrail/core/agents';
import {
  createLookoutSignIn,
  createProjectsHub,
  createTrackerBridge,
  type LookoutSignIn,
  type ProjectsHub,
} from '@teamtrail/core/bridge';
import { fail } from '../args/help';
import type { ServeOptions } from '../args/parseArgs';
import { createMcpHttp } from '../mcp/http/createMcpHttp';
import { endpointUrl } from '../mcp/http/endpointUrl';
import { remoteAgentOpener } from '../mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../mcp/http/tokenFileAuth';
import { printGreeting } from '../printGreeting';
import { keepServing } from './keepServing';
import { lanUrls } from './lanUrls';
import { listen, type Listening } from './listen';
import { listenFailure } from './listenFailure';
import { lookoutHandler } from './lookoutHandler';
import { lookoutUrl } from './lookoutUrl';
import { openBrowser } from './openBrowser';
import { pairLink } from './pairLink';

/** The code of the link this command prints and opens; without the user's config folder nobody could sign in. */
function firstCode(signIn: LookoutSignIn) {
  try {
    return signIn.mintCode('machine').code;
  } catch (e) {
    return fail(`can't write ${BRAND.name}'s config folder, where sign-in lives (${(e as Error).message})`);
  }
}

/** The default command: one process serving the lookout bundle and the tracker API, until Ctrl+C. */
export async function serveLookout(opts: ServeOptions, slackSetup: boolean) {
  const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
  if (!existsSync(path.join(appDir, 'index.html'))) fail(`Lookout bundle missing at ${appDir}; reinstall the package`);

  const root = path.resolve(process.cwd(), opts.dir);
  // Remote agents' tools over HTTP, for tokens created in Settings: closed until one exists, and on this port
  // for this machine only. The same port serves the Lookout and its API, signed in with a browser cookie, never a
  // token: agents elsewhere connect to `teamtrail mcp --http`.
  const mcp = createMcpHttp({
    auth: tokenFileAuth(root),
    open: remoteAgentOpener({ root, version: __VERSION__ }),
    thisMachineOnly: true,
  });
  let hub: ProjectsHub | undefined;
  const handler = lookoutHandler({ appDir, mcp, hub: () => hub });

  // One server per address (the --host one, 127.0.0.1 and ::1), all with the same handler: see listen.ts.
  let listening: Listening;
  try {
    const retries = opts.portExplicit ? 0 : 20;
    listening = await listen({ make: () => http.createServer(handler), port: opts.port, host: opts.host, retries });
  } catch (err) {
    fail(listenFailure(err));
  }
  const { port, servers, addresses } = listening;
  const url = lookoutUrl(port);
  const bridge = createTrackerBridge(root, {
    plugins: [slackPlugin()],
    url: () => url,
  });
  // Every API route needs a paired browser; the link below pairs the one this command opens.
  const signIn = createLookoutSignIn({ root: bridge.root, lanUrls: () => lanUrls(addresses, port) });
  // Other registered projects open on first use, at /p/<id>/…, with their own checkout for the GitHub origin; Slack stays with the home project.
  hub = createProjectsHub({
    signIn,
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, { cwd: p.path, url: () => url }),
    url: () => url,
  });
  keepServing();
  printGreeting();
  const signInLink = pairLink(url, firstCode(signIn), slackSetup ? '?settings=slack' : '');
  process.stdout.write(
    `\n  ${BRAND.name} ${__VERSION__} · ${BRAND.assistant.name} online\n\n` +
      `  Lookout  ${url}\n` +
      `  Sign in  ${signInLink}\n` +
      `           Click it to sign in the browser: once, within 10 minutes. \`${BRAND.slug} pair\` prints another.\n` +
      `  Tracker         ${path.relative(process.cwd(), bridge.root) || '.'}${path.sep}  (${bridge.root})\n\n` +
      `  Press Ctrl+C to stop.\n\n`,
  );
  if (slackSetup) process.stdout.write(`  Slack setup     ${url}?settings=slack\n\n`);
  // The browser opens on the Lookout itself, never on the link: a command line is readable by every process of
  // this user for a moment, and the code would be on it. The link is only in this terminal.
  if (opts.open) openBrowser(slackSetup ? `${url}?settings=slack` : url);
  const unlock = writeLookoutLock(bridge.root, url);
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
    let open = servers.length;
    for (const server of servers) {
      server.close(() => --open || process.exit(0));
      server.closeAllConnections();
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
