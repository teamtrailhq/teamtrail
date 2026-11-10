import { BRAND, npxCommand, shellQuote } from '@teamtrail/core';
import { CLI_VERSION } from '../../lib/cliVersion';

export type RemoteClient = 'claude' | 'codex';

/** Stands in for the endpoint while no `teamtrail mcp --http` is running. */
export const ENDPOINT_PLACEHOLDER = '<endpoint>';

/**
 * The server remote agents connect to: the agent tools on a port of their own. Like every command the Lookout
 * shows, it names this Lookout's exact version, never whatever `teamtrail` is newest on npm.
 */
export const START_COMMAND = npxCommand(CLI_VERSION, ['mcp', '--http']);

/**
 * What to run on the agent's machine. The token is never part of the command: the first line waits for it to be
 * pasted, without showing it, so it stays out of the screen, the shell history and the process list. The
 * endpoint comes from a file on disk, so it is quoted as one word whatever it holds; only the placeholder,
 * which the person replaces, is left bare.
 */
export function connectCommand(client: RemoteClient, url: string) {
  const connect = npxCommand(CLI_VERSION, ['connect', client, '--url']);
  const target = url === ENDPOINT_PLACEHOLDER ? url : shellQuote(url);
  return `read -rs ${BRAND.tokenEnv} && export ${BRAND.tokenEnv}\n${connect} ${target}`;
}
