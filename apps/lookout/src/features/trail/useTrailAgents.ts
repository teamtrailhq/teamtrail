import { useEffect, useState } from 'react';
import { readTrailAgents, setTrailAgents, type TrailAgents } from '../../lib/trailAgents';

export interface TrailAgentsControl {
  mapId: string;
  state?: TrailAgents;
  busy: boolean;
  error?: string;
  repo?: string;
  setRepo: (repo: string | undefined) => void;
  /** Agents on or off for the trail; resolves true once they're on. */
  act: (on: boolean) => Promise<boolean>;
}

/** This person's agents on one trail, from the server that runs them (lib/trailAgents.ts), read again now and then. */
export function useTrailAgents(mapId: string): TrailAgentsControl {
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
  const act = async (on: boolean) => {
    setBusy(true);
    setError(undefined);
    const next = await setTrailAgents(mapId, { on, ...(on && repo ? { repo } : {}) });
    setBusy(false);
    if ('error' in next) {
      setError(next.error);
      return false;
    }
    setState(next);
    return on;
  };
  return { mapId, state, busy, error, repo, setRepo, act };
}
