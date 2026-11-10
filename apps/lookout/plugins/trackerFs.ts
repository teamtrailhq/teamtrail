import type { Plugin, ViteDevServer } from 'vite';
import { createMcpHttp } from '../../../packages/cli/src/mcp/http/createMcpHttp';
import { remoteAgentOpener } from '../../../packages/cli/src/mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../../../packages/cli/src/mcp/http/tokenFileAuth';
import { slackPlugin } from '../../../packages/connector-slack/src/node';
import { writeMcpEndpoint } from '../../../packages/core/src/agentHost';
import { createProjectsHub, createTrackerBridge } from '../../../packages/core/src/bridge';

/**
 * Mounts the tracker file API (shared with the `teamtrail` CLI) on the Vite dev server, with the projects hub
 * in front: `/projects` and `/p/<id>/…` for the projects in `projectsConfigDir` (default: the user config dir).
 * Like the CLI, it also serves the MCP endpoint for remote agents at `/mcp` (closed until a token is created).
 */
export function trackerFs(opts: { root: string; prefix: string; projectsConfigDir?: string }): Plugin {
  return {
    name: 'tracker-fs',
    configureServer(server: ViteDevServer) {
      const url = () => {
        const a = server.resolvedUrls?.local[0];
        return a ? a.replace(/\/?$/, '/') : undefined;
      };
      const bridge = createTrackerBridge(opts.root, { plugins: [slackPlugin()], url });
      const hub = createProjectsHub({
        home: bridge,
        openBridge: (p) => createTrackerBridge(p.root, { cwd: p.path, url }),
        configDir: opts.projectsConfigDir,
        url,
      });
      const mcp = createMcpHttp({
        auth: tokenFileAuth(bridge.root),
        open: remoteAgentOpener({ root: bridge.root, version: 'dev' }),
      });
      let unlist = () => {};
      server.httpServer?.once('listening', () => {
        const { port } = server.httpServer!.address() as { port: number };
        // The dev server listens on every interface (vite.config.ts `host: true`).
        unlist = writeMcpEndpoint(bridge.root, { url: `http://localhost:${port}/mcp`, kind: 'lookout', network: true });
      });
      server.httpServer?.on('close', () => {
        unlist();
        void mcp.close();
        hub.close();
        bridge.close();
      });
      server.middlewares.use(opts.prefix, (req, res) => void hub.handle(req, res));
      server.middlewares.use('/mcp', (req, res, next) => {
        const exact = new URL(req.url ?? '/', 'http://x').pathname === '/';
        if (exact) void mcp.handle(req, res);
        else next();
      });
    },
  };
}
