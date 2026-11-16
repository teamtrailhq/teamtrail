import { Button } from '../../components/ui';
import { hostedAgents, openHostedAgents } from '../../lib/hostedAgents';
import { trailAgentsPath } from '../../lib/trailAgents';
import { AgentCommand } from './AgentCommand';
import { StartTrail } from './StartTrail';

/**
 * After New trail: how to get it moving. Behind a server that runs agents: Start the trail, right here (StartTrail);
 * else your own agent's command.
 */
export function CreatedNote({ created, mapId, onStarted }: { created: string; mapId: string; onStarted?: () => void }) {
  if (trailAgentsPath())
    return (
      <div className="agent-draft created">
        <span>Trail {created} is on the map, starting with discovery.</span>
        <StartTrail mapId={mapId} onStarted={onStarted} />
      </div>
    );
  const page = hostedAgents();
  if (page)
    return (
      <div className="agent-draft created">
        <span>
          Trail {created} is on the map, starting with discovery. Turn your agents on for it to get it moving.
        </span>
        <Button onClick={openHostedAgents}>{page.label}</Button>
      </div>
    );
  return (
    <div className="agent-draft created">
      <span>
        Trail {created} is on the map, starting with discovery. To get it moving, run this in Claude Code or Codex:
      </span>
      <AgentCommand command="/scout resume" label="Copy command" />
    </div>
  );
}
