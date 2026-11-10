import { remoteTokenViews, touchRemoteToken, verifyRemoteToken } from '@teamtrail/core/agents';
import type { McpHttpAuth } from './types';

/**
 * Tokens from the repo's local token file (Settings → Remote agents). With no token created nothing
 * authenticates, so the endpoint is closed until the trail lead opens it.
 */
export function tokenFileAuth(root: string): McpHttpAuth {
  return {
    authenticate(token) {
      const record = verifyRemoteToken(root, token);
      return record && { id: record.id, name: record.name };
    },
    snapshot() {
      const live = new Set(remoteTokenViews(root).map((t) => t.id));
      return (principal) => live.has(principal.id);
    },
    used(principal) {
      try {
        touchRemoteToken(root, principal.id);
      } catch {
        // "last used" is a convenience; a failed write must not fail the agent's request
      }
    },
  };
}
