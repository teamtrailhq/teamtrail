import { useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { hostedAgents } from '../../lib/hostedAgents';
import { readTrailAgents, setTrailAgents, type TrailAgents } from '../../lib/trailAgents';

/** What the agents are doing, in a few words. */
function status(s: TrailAgents) {
  if (s.running) return `Agents on · ${s.running} working`;
  return s.note ? `Agents on · ${s.note}` : 'Agents on · starting soon';
}

/**
 * Start the trail, in place: switches this person's agents on for it (in the one repository, or the one picked) and
 * shows what they're doing, with Pause and a link to their runs. Only behind a server that runs agents and says
 * where (lib/trailAgents.ts); the server checks everything again.
 */
export function StartTrail({ mapId }: { mapId: string }) {
  const [state, setState] = useState<TrailAgents>();
  const [repo, setRepo] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    const load = () => void readTrailAgents(mapId).then((s) => live && s && setState(s));
    load();
    // While on, what they're doing changes on its own: read it again now and then.
    const timer = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [mapId]);
  if (!state || !state.canRun) return null;
  const act = async (on: boolean) => {
    setBusy(true);
    setError(undefined);
    const next = await setTrailAgents(mapId, { on, ...(on && repo ? { repo } : {}) });
    setBusy(false);
    if ('error' in next) return setError(next.error);
    setState(next);
  };
  const runs = hostedAgents();
  if (state.on)
    return (
      <span className="start-trail">
        <span className="start-trail-status">{status(state)}</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(false)}>
          Pause
        </Button>
        {runs && (
          <a className="t-meta" href={`${runs.href}#trail-${encodeURIComponent(mapId)}`}>
            Runs
          </a>
        )}
        {error && <span className="vf-err">{error}</span>}
      </span>
    );
  return (
    <span className="start-trail">
      {state.repos.length > 1 && (
        <select aria-label="Repository" value={repo ?? ''} onChange={(e) => setRepo(e.target.value || undefined)}>
          <option value="">Repository…</option>
          {state.repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      <Button size="sm" disabled={busy || (state.repos.length > 1 && !repo)} onClick={() => void act(true)}>
        Start the trail
      </Button>
      {!state.repos.length && <span className="t-meta">Connect a repository first.</span>}
      {error && <span className="vf-err">{error}</span>}
    </span>
  );
}
