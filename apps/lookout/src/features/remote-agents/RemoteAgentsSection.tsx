import { SettingsSection } from '../settings/SettingsSection';
import { START_COMMAND } from './connectCommands';
import { EndpointLine } from './EndpointLine';
import { NewTokenForm } from './NewTokenForm';
import { RemoteAgentsElsewhere } from './RemoteAgentsElsewhere';
import { RemoteTokenList } from './RemoteTokenList';
import { TokenReveal } from './TokenReveal';
import { useRemoteAgents } from './useRemoteAgents';

/**
 * Settings → Project → Remote agents: tokens for agents that reach this repo's MCP endpoint over HTTP, from another
 * machine or a cloud sandbox. With no token the endpoint is closed.
 */
export function RemoteAgentsSection() {
  const { view, created, dismissCreated, create, revoke } = useRemoteAgents();
  if (!view) return null;
  if (view === 'elsewhere') return <RemoteAgentsElsewhere />;
  // Only a server meant for other machines: the Lookout's own port answers this machine alone.
  const endpoint = view.endpoints.find((e) => e.kind === 'standalone')?.url;
  return (
    <SettingsSection title="Remote agents">
      <p className="vf-intro">
        Agents on another machine or in a cloud sandbox can work this repo's trails too. They connect over HTTP with a
        token and share the tickets, claims and inbox of the agents here. One token per agent; revoke it and that agent
        is out within about a second.
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
          <b>Before you open it to other machines.</b> The connection is plain HTTP. Run <code>{START_COMMAND}</code>,
          which serves the agent tools and nothing else, and put that port behind HTTPS with a reverse proxy or a
          tunnel. The Lookout's own port is not for sharing: it has no sign-in, so its agent endpoint and these tokens
          answer this machine only. A token only ever opens the agent tools.
        </p>
        <p className="t-meta ra-note">
          <b>What a remote agent can't do.</b> Speak for you: it can't answer a question, skip discovery, change the
          trail's mode or destination, or close a ticket that needs you before you've answered here or in Slack. And its
          files aren't on this machine, so it gets no worktree, and on trails with verification its finished work comes
          to you to review instead of running the checks here.
        </p>
        <p className="t-meta ra-note">
          <b>How far to trust one.</b> The risk policy only sees what an agent declares: a call is held for you when the
          agent names a high-risk category or touches files your path rules cover. An agent that declares nothing isn't
          caught. Give an agent you don't fully trust only trails with verification on, where its finished work comes to
          you.
        </p>
        <p className="t-meta ra-note">
          <b>What it does as you.</b> With GitHub Issues or Linear as the tracker, everything a remote agent writes
          (tickets, comments, closing) goes to the tracker with your credentials, like the agents here.
        </p>
      </div>
    </SettingsSection>
  );
}
