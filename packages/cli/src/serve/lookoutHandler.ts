import type http from 'node:http';
import { BRAND } from '@teamtrail/core';
import { neverCrash, requestUrl, type ProjectsHub } from '@teamtrail/core/bridge';
import { MCP_PATH } from '../mcp/http/endpointUrl';
import type { McpHttp } from '../mcp/http/types';
import { serveStatic } from './staticFiles';

/**
 * Everything the Lookout's port answers: the MCP endpoint (this machine only, see serveLookout.ts), the tracker
 * API under its prefix once the hub is up, and the app bundle for everything else. Whatever a request carries
 * (`GET //`, a bad percent-encoding), it gets an answer and the process keeps serving.
 */
export function lookoutHandler(o: { appDir: string; mcp: McpHttp; hub: () => ProjectsHub | undefined }) {
  return neverCrash(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = requestUrl(req);
    if (url.pathname === MCP_PATH) return o.mcp.handle(req, res);
    const hub = o.hub();
    if (hub && (url.pathname === BRAND.apiPrefix || url.pathname.startsWith(`${BRAND.apiPrefix}/`))) {
      req.url = req.url!.slice(BRAND.apiPrefix.length) || '/';
      return hub.handle(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end();
      return;
    }
    await serveStatic(o.appDir, url.pathname, res);
  });
}
