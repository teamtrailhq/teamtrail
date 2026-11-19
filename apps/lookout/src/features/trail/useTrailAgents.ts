import { useEffect, useRef, useState } from 'react';
import type { TrailAgents } from '../../lib/trailAgents';
import { trailAgentsRun, type TrailAgentsPending, type TrailAgentsRunView } from './trailAgentsRun';

export interface TrailAgentsControl {
  mapId: string;
  state?: TrailAgents;
  /** Starting… after Start until a run is reported, Stopping… after Pause until none is (trailAgentsRun.ts). */
  pending?: TrailAgentsPending;
  busy: boolean;
  error?: string;
  repo?: string;
  setRepo: (repo: string | undefined) => void;
  /** Agents on or off for the trail; resolves true once they're on. */
  act: (on: boolean) => Promise<boolean>;
}

/** This person's agents on one trail, from the server that runs them (lib/trailAgents.ts), read again now and then. */
export function useTrailAgents(mapId: string): TrailAgentsControl {
  const [view, setView] = useState<TrailAgentsRunView>({ busy: false });
  const [repo, setRepo] = useState<string>();
  const run = useRef<ReturnType<typeof trailAgentsRun>>(undefined);
  useEffect(() => {
    const r = trailAgentsRun({ mapId, onChange: setView });
    run.current = r;
    return () => {
      r.dispose();
      setView({ busy: false });
    };
  }, [mapId]);
  const act = (on: boolean) => run.current?.act(on, repo) ?? Promise.resolve(false);
  return { mapId, ...view, repo, setRepo, act };
}
