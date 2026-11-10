import { BRAND } from '@teamtrail/core';

export type RemoteClient = 'claude' | 'codex';

/** Where to connect when no endpoint is running yet: the default of `teamtrail mcp --http`. */
export const PLACEHOLDER_ENDPOINT = 'http://<this-machine>:7421/mcp';

/**
 * What to run on the agent's machine. Claude Code keeps the token in its own config, so connect takes it;
 * Codex reads it from the environment every time it starts, so it is exported and never written down.
 */
export function connectCommand(client: RemoteClient, at: { url: string; token: string }) {
  const connect = `npx -y ${BRAND.npm} connect ${client} --url ${at.url}`;
  if (client === 'claude') return `${connect} --token ${at.token}`;
  return `export ${BRAND.tokenEnv}=${at.token}\n${connect}`;
}
