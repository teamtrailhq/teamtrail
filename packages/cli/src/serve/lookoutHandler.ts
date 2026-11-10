import type http from 'node:http';
import { BRAND } from '@teamtrail/core';
import type { ProjectsHub } from '@teamtrail/core/bridge';
import { MCP_PATH } from '../mcp/http/endpointUrl';
import type { McpHttp } from '../mcp/http/types';
import { serveStatic } from './staticFiles';

/**
 * Everything the Lookout's port answers: the MCP endpoint (this machine only, see serveLookout.ts), the tracker
 * API under its prefix once the hub is up, and the app bundle for everything else.
 */
export function lookoutHandler(o: { appDir: string; mcp: McpHttp; hub: () => ProjectsHub | undefined }) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === MCP_PATH) return void o.mcp.handle(req, res);
    const hub = o.hub();
    if (hub && (url.pathname === BRAND.apiPrefix || url.pathname.startsWith(`${BRAND.apiPrefix}/`))) {
      req.url = req.url!.slice(BRAND.apiPrefix.length) || '/';
      void hub.handle(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end();
      return;
    }
    serveStatic(o.appDir, url.pathname, res).catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  };
}
