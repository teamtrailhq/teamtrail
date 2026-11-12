import { AddScout } from './AddScout';

/**
 * Scout was added to this workspace before it could answer @Scout mentions: everything else works, and adding it
 * again asks Slack for the one missing permission. Not urgent, so no colour.
 */
export function MentionsHint(props: { onError: (message: string) => void }) {
  return (
    <div className="test-line mentions-hint">
      <span>Reconnect to allow @Scout mentions: Slack needs one more permission for them.</span>
      <AddScout again onError={props.onError} />
    </div>
  );
}
