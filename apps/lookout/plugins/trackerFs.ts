import type { Plugin, ViteDevServer } from 'vite';
import { slackPlugin } from '../../../packages/connector-slack/src/node';
import { createProjectsHub, createTrackerBridge } from '../../../packages/core/src/bridge';

/**
 * Mounts the tracker file API (shared with the `teamtrail` CLI) on the Vite dev server, with the projects hub
 * in front: `/projects` and `/p/<id>/…` for the projects in `projectsConfigDir` (default: the user config dir).
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
      server.httpServer?.on('close', () => {
        hub.close();
        bridge.close();
      });
      server.middlewares.use(opts.prefix, (req, res) => void hub.handle(req, res));
    },
  };
}
