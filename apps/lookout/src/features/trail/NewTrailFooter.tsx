import { Button } from '../../components/ui';
import { hostedAgents } from '../../lib/hostedAgents';
import { AgentCommand } from './AgentCommand';
import { CreatedNote } from './CreatedNote';

/**
 * New trail's footer, always in view under the scrolling fields: the /scout command for the agent's chat, what
 * went wrong or the trail just made, and Close / Create trail.
 */
export function NewTrailFooter(props: {
  idea: string;
  tracker: string;
  created?: { key: string; id: string };
  error?: string;
  /** Create is off: busy, a required field empty or a field past its limit. */
  disabled: boolean;
  onCreate: () => void;
  onClose: () => void;
}) {
  const hosted = hostedAgents();
  return (
    <footer className="new-trail-foot">
      {!hosted && !props.created && (
        <div className="agent-draft">
          <span className="dim">
            Or paste this in Claude Code or Codex. Scout frames the trail with you there, then charts it here in{' '}
            {props.tracker}.
          </span>
          <AgentCommand command={`/scout new "${props.idea || 'your idea'}"`} label="Copy command" />
        </div>
      )}
      {props.created && (
        <CreatedNote
          created={props.created.key}
          mapId={props.created.id}
          onStarted={props.onClose}
          onClose={props.onClose}
        />
      )}
      {props.error && (
        <p className="vf-err" role="alert">
          {props.error}
        </p>
      )}
      <div className="new-trail-buttons">
        <Button variant="ghost" onClick={props.onClose}>
          Close
        </Button>
        {!props.created && (
          <Button
            variant="primary"
            disabled={props.disabled}
            data-tip={
              hosted
                ? 'Put the trail on the map now, then turn your agents on for it'
                : 'Put the trail on the map now; any agent picks it up with /scout resume'
            }
            onClick={props.onCreate}
          >
            Create trail
          </Button>
        )}
      </div>
    </footer>
  );
}
