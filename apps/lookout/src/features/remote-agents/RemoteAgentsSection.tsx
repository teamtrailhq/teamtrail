import { BRAND } from '@teamtrail/core';
import { SettingsSection } from '../settings/SettingsSection';
import { PLACEHOLDER_ENDPOINT } from './connectCommands';
import { EndpointLine } from './EndpointLine';
import { NewTokenForm } from './NewTokenForm';
import { RemoteTokenList } from './RemoteTokenList';
import { TokenReveal } from './TokenReveal';
import { useRemoteAgents } from './useRemoteAgents';

/**
 * Settings → Remote agents: tokens for agents that reach this repo's MCP endpoint over HTTP, from another
 * machine or a cloud sandbox. With no token the endpoint is closed.
 */
export function RemoteAgentsSection() {
  const { view, created, dismissCreated, create, revoke } = useRemoteAgents();
  if (!view) return null;
  const endpoint = view.endpoints[0]?.url ?? PLACEHOLDER_ENDPOINT;
  return (
    <SettingsSection title="Remote agents">
      <p className="vf-intro">
        Agents on another machine or in a cloud sandbox can work this repo's trails too. They connect over HTTP with a
        token and share the tickets, claims and inbox of the agents here. One token per agent; revoke it and that agent
        is out within a second.
      </p>
      <EndpointLine endpoints={view.endpoints} />
      {created && <TokenReveal created={created} endpoint={endpoint} onDone={dismissCreated} />}
      <RemoteTokenList tokens={view.tokens} onRevoke={revoke} />
      {view.tokens.length === 0 && (
        <p className="t-meta ra-note">No tokens, so the endpoint is closed: every request is refused.</p>
      )}
      <NewTokenForm onCreate={create} />
      <div className="ra-notes">
        <p className="t-meta ra-note">
          <b>Before you open it to other machines.</b> The connection is plain HTTP, and the Lookout itself has no
          sign-in: anyone who reaches its port can answer and approve as you. So don't share the Lookout's port. Run{' '}
          <code>npx {BRAND.npm} mcp --http</code>, which serves the agent tools and nothing else, and put that port
          behind HTTPS with a reverse proxy or a tunnel. A token only ever opens the agent tools.
        </p>
        <p className="t-meta ra-note">
          <b>What a remote agent can't do.</b> Its files aren't on this machine, so it gets no worktree, and on trails
          with verification its finished work comes to you to review instead of running the checks here.
        </p>
      </div>
    </SettingsSection>
  );
}
