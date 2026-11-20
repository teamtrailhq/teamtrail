import { EmptyState } from '../../components/ui';
import { hostedAgents } from '../../lib/hostedAgents';

/** No agent at work yet: where to start them. */
export function NoAgents() {
  const hosted = hostedAgents();
  return (
    <EmptyState
      title="No agent working yet"
      hint={
        hosted
          ? `Turn your agents on for this trail in ${hosted.label}. Their claims, questions and finished work show here.`
          : 'Run /scout resume in Claude Code or Codex. Their claims, questions and finished work show here.'
      }
    />
  );
}
