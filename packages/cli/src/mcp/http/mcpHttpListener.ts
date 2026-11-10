import type { IncomingMessage, ServerResponse } from 'node:http';
import { neverCrash, requestUrl, setSecurityHeaders } from '@teamtrail/core/bridge';
import { MCP_PATH } from './endpointUrl';
import { refuse } from './respond';
import type { McpHttp } from './types';

/** What the port of `teamtrail mcp --http` answers: the MCP endpoint, and 404 for anything else. */
export function mcpHttpListener(mcp: McpHttp) {
  return neverCrash(
    (req: IncomingMessage, res: ServerResponse) => {
      setSecurityHeaders(res, 'api');
      if (requestUrl(req).pathname === MCP_PATH) return mcp.handle(req, res);
      refuse(res, 404, `Not found. The MCP endpoint is ${MCP_PATH}.`);
    },
    // In the endpoint's own JSON-RPC shape, and never the error's text.
    (res) => refuse(res, 400, 'Bad request.'),
  );
}
