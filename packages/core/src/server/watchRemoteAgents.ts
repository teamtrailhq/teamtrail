import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { REMOTE_TOKENS_FILE, REMOTE_TOKENS_USED_FILE } from '../remoteAgents/remoteTokenStore';

/**
 * Sends a named `remote-agents` SSE event when a token is created, revoked or used, or an MCP endpoint starts or
 * stops, so Settings → Project → Remote agents stays current. Returns the stop function.
 */
export function watchRemoteAgents(root: string, send: (text: string) => void, pollMs = 1000): () => void {
  const mtime = (rel: string) => statSync(path.join(root, rel), { throwIfNoEntry: false })?.mtimeMs ?? 0;
  const endpoints = () => {
    try {
      return readdirSync(path.join(root, AGENTS_DIR, 'mcp-endpoints')).join(',');
    } catch {
      return '';
    }
  };
  const signature = () => `${mtime(REMOTE_TOKENS_FILE)}|${mtime(REMOTE_TOKENS_USED_FILE)}|${endpoints()}`;
  let last = signature();
  const poll = setInterval(() => {
    const sig = signature();
    if (sig === last) return;
    last = sig;
    send('event: remote-agents\ndata: {}\n\n');
  }, pollMs);
  poll.unref?.();
  return () => clearInterval(poll);
}
