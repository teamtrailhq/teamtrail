import { StartTrail } from './StartTrail';
import { useTrailAgents } from './useTrailAgents';

/** Start the trail for a trail just created (CreatedNote). */
export function HostedStart({ mapId, onStarted }: { mapId: string; onStarted?: () => void }) {
  return <StartTrail agents={useTrailAgents(mapId)} onStarted={onStarted} />;
}
