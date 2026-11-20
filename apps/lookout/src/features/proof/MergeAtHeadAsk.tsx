/** Merge anyway when the proof names no commit: the pull request's head is what is accepted, so it is shown. */
export function MergeAtHeadAsk(props: { head: string }) {
  return (
    <span className="t-meta">
      Merge without a verified proof? Its proof names no commit, so you accept the pull request as it is now, at head{' '}
      <code title={props.head}>{props.head.slice(0, 12)}</code>. It is recorded as your decision.
    </span>
  );
}
