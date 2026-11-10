import type { McpEndpoint, RemoteTokenView } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onServerEvent } from '../../lib/trackerChanges';

export interface RemoteAgentsView {
  tokens: RemoteTokenView[];
  /** MCP endpoints being served for this repo right now; the one made for sharing first. */
  endpoints: McpEndpoint[];
}

/** A token just created: the only time its value is known to the page. */
export interface CreatedToken {
  token: string;
  name: string;
}

type Reply = RemoteAgentsView & { token?: string; created?: RemoteTokenView; error?: string };

const url = `${apiBase()}/remote-agents`;

async function post(path: string, body: unknown): Promise<{ ok: boolean; reply: Reply }> {
  const r = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, reply: (await r.json()) as Reply };
}

/**
 * Settings → Remote agents: the tokens and the endpoints, kept current by the server's `remote-agents` event.
 * undefined while loading, null without a server. `create` and `revoke` resolve to an error message, if any.
 */
export function useRemoteAgents() {
  const [view, setView] = useState<RemoteAgentsView | null>();
  const [created, setCreated] = useState<CreatedToken>();
  const load = useCallback(() => {
    fetch(url)
      .then(async (r) => (r.ok ? ((await r.json()) as RemoteAgentsView) : null))
      .then(setView, () => setView(null));
  }, []);
  useEffect(() => {
    load();
    return onServerEvent('remote-agents', load);
  }, [load]);
  const create = useCallback(async (name: string): Promise<string | undefined> => {
    const { ok, reply } = await post('/tokens', { name });
    if (!ok || !reply.token || !reply.created) return reply.error ?? 'The token could not be created.';
    setView({ tokens: reply.tokens, endpoints: reply.endpoints });
    setCreated({ token: reply.token, name: reply.created.name });
    return undefined;
  }, []);
  const revoke = useCallback(async (id: string): Promise<string | undefined> => {
    const { ok, reply } = await post('/tokens/revoke', { id });
    if (reply.tokens) setView({ tokens: reply.tokens, endpoints: reply.endpoints });
    return ok ? undefined : (reply.error ?? 'The token could not be revoked.');
  }, []);
  return { view, created, dismissCreated: () => setCreated(undefined), create, revoke };
}
