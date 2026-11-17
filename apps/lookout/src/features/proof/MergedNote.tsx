/** What a merge came to: merged at the commit the proof covers, with the pull request's link. */
export function MergedNote(props: { url?: string; anyway?: boolean }) {
  const what = props.anyway ? 'Merged at the commit its proof covers.' : 'Approved and merged at the verified commit.';
  return (
    <span className="t-meta merge-note">
      {what}{' '}
      {props.url && (
        <a href={props.url} target="_blank" rel="noreferrer">
          See the pull request
        </a>
      )}
    </span>
  );
}
