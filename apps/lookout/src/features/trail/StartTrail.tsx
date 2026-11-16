import { Button } from '../../components/ui';
import { hostedAgents } from '../../lib/hostedAgents';
import { trailAgentsStatus } from './trailAgentsStatus';
import type { TrailAgentsControl } from './useTrailAgents';

/**
 * Start the trail, in place: switches this person's agents on for it (in the one repository, or the one picked) and
 * shows what they're doing, with Pause and a link to their runs; `onStarted` once they're on (New trail closes). Only
 * behind a server that runs agents and says where (lib/trailAgents.ts); the server checks everything again.
 */
export function StartTrail({ agents, onStarted }: { agents: TrailAgentsControl; onStarted?: () => void }) {
  const { state, busy, error, repo } = agents;
  if (!state || !state.canRun) return null;
  const start = () => void agents.act(true).then((on) => on && onStarted?.());
  const runs = hostedAgents();
  if (state.on)
    return (
      <span className="start-trail">
        <span className="start-trail-status">{trailAgentsStatus(state)}</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void agents.act(false)}>
          Pause
        </Button>
        {runs && (
          <a className="t-meta" href={`${runs.href}#trail-${encodeURIComponent(agents.mapId)}`}>
            Runs
          </a>
        )}
        {error && <span className="vf-err">{error}</span>}
      </span>
    );
  return (
    <span className="start-trail">
      {state.repos.length > 1 && (
        <select
          aria-label="Repository"
          value={repo ?? ''}
          onChange={(e) => agents.setRepo(e.target.value || undefined)}
        >
          <option value="">Repository…</option>
          {state.repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      <Button variant="primary" disabled={busy || (state.repos.length > 1 && !repo)} onClick={start}>
        Start the trail
      </Button>
      {!state.repos.length && <span className="t-meta">Connect a repository first.</span>}
      {error && <span className="vf-err">{error}</span>}
    </span>
  );
}
