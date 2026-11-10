import { BRAND } from '@teamtrail/core';

export type RemoteClient = 'claude' | 'codex';

/** Stands in for the endpoint while no `teamtrail mcp --http` is running. */
export const ENDPOINT_PLACEHOLDER = '<endpoint>';

/** The server remote agents connect to: the agent tools on a port of their own. */
export const START_COMMAND = `npx ${BRAND.npm} mcp --http`;

/**
 * What to run on the agent's machine. The token is never part of the command: the first line waits for it to be
 * pasted, without showing it, so it stays out of the screen, the shell history and the process list.
 */
export function connectCommand(client: RemoteClient, url: string) {
  return `read -rs ${BRAND.tokenEnv} && export ${BRAND.tokenEnv}\nnpx -y ${BRAND.npm} connect ${client} --url ${url}`;
}
