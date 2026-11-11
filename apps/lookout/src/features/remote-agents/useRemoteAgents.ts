import type { McpEndpoint, RemoteTokenView } from '@teamtrail/core';
import { useCallback, useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

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

async function fetchView(): Promise<RemoteAgentsView | 'elsewhere' | null> {
  const r = await fetch(url);
  if (r.ok) return (await r.json()) as RemoteAgentsView;
  const refused = (await r.json().catch(() => ({}))) as { elsewhere?: boolean };
  return refused.elsewhere ? 'elsewhere' : null;
}

/**
 * Settings → Project → Remote agents: the tokens and the endpoints, kept current by the server's `remote-agents` event.
 * undefined while loading, null without a server, `elsewhere` when this page is open on another device than the
 * one Teamtrail runs on (tokens are only managed there). `create` and `revoke` resolve to an error message, if any.
 */
export function useRemoteAgents() {
  const [view, setView] = useState<RemoteAgentsView | 'elsewhere' | null>();
  const [created, setCreated] = useState<CreatedToken>();
  const { pushed } = useLiveLoad({
    load: fetchView,
    show: setView,
    failed: () => setView(null),
    events: { 'remote-agents': () => true },
  });
  /** The reply carries the list as it is now: loads started before it are older. */
  const showReply = useCallback(
    (reply: Reply) => {
      pushed();
      setView({ tokens: reply.tokens, endpoints: reply.endpoints });
    },
    [pushed],
  );
  const create = useCallback(
    async (name: string): Promise<string | undefined> => {
      const { ok, reply } = await post('/tokens', { name });
      if (!ok || !reply.token || !reply.created) return reply.error ?? 'The token could not be created.';
      showReply(reply);
      setCreated({ token: reply.token, name: reply.created.name });
      return undefined;
    },
    [showReply],
  );
  const revoke = useCallback(
    async (id: string): Promise<string | undefined> => {
      const { ok, reply } = await post('/tokens/revoke', { id });
      if (reply.tokens) showReply(reply);
      return ok ? undefined : (reply.error ?? 'The token could not be revoked.');
    },
    [showReply],
  );
  return { view, created, dismissCreated: () => setCreated(undefined), create, revoke };
}
