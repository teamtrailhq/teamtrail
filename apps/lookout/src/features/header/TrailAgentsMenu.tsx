import { hostedAgents } from '../../lib/hostedAgents';
import { ChecksNote, StartTrail, trailAgentsStatus, useTrailAgents } from '../trail';
import { HeaderMenu } from './HeaderMenu';

/**
 * The trail's agents in the header: Start the trail, then one menu with what they're doing, Pause and their runs, and,
 * while the project has no approved checks, the way to set them (ChecksNote), inside the menu so the header stays one row.
 */
export function TrailAgentsMenu({ mapId }: { mapId: string }) {
  const agents = useTrailAgents(mapId);
  const { state, pending } = agents;
  if (!state?.on) return <StartTrail agents={agents} />;
  const runs = hostedAgents();
  return (
    <>
      <HeaderMenu
        className="agents-menu"
        label={
          <>
            <span className={state.running ? 'agents-dot on' : 'agents-dot'} aria-hidden="true" />
            {trailAgentsStatus(state, pending)}
          </>
        }
      >
        {(close) => (
          <>
            <button
              role="menuitem"
              className="header-menu-item"
              disabled={agents.busy || pending === 'starting'}
              onClick={() => {
                close();
                void agents.act(false);
              }}
            >
              {pending === 'starting' ? 'Starting…' : 'Pause agents'}
            </button>
            {runs && (
              <a role="menuitem" className="header-menu-item" href={`${runs.href}#trail-${encodeURIComponent(mapId)}`}>
                Runs
              </a>
            )}
            <ChecksNote onOpen={close} />
          </>
        )}
      </HeaderMenu>
      {agents.error && <span className="vf-err">{agents.error}</span>}
    </>
  );
}
