import { Button } from '../../components/ui';
import { hostedAgents, openHostedAgents } from '../../lib/hostedAgents';
import { AgentCommand } from './AgentCommand';

/** After New trail: how to get it moving, with your own agent, or by turning the server's agents on for it. */
export function CreatedNote({ created }: { created: string }) {
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
