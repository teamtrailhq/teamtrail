import { fail } from '../../args/help';
import type { SubOptions } from '../../args/parseArgs';
import type { McpHttpServeOptions } from './runMcpHttp';

/** Default port of `teamtrail mcp --http`: next to the Lookout's 7420. */
const DEFAULT_PORT = 7421;

/** `teamtrail mcp --http` options from its flags. Binds this machine only unless `--host` says otherwise. */
export function mcpHttpOptions(o: SubOptions, root: string): McpHttpServeOptions {
  if (o.agent) fail('--agent names one stdio agent; over HTTP every session gets its own trail name');
  return {
    root,
    host: o.host ?? '127.0.0.1',
    port: o.port ?? DEFAULT_PORT,
    portExplicit: o.port !== undefined,
    allowHosts: o.allowHosts,
    leaseMinutes: o.leaseMinutes,
    noRegister: o.noRegister,
    version: __VERSION__,
  };
}
