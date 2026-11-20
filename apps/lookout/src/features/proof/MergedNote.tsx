/** What a merge came to: where it merged (the verified commit, the proof's, or the head accepted), and the link. */
export function MergedNote(props: { url?: string; anyway?: boolean; head?: string }) {
  const what = mergedWhere(props);
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

function mergedWhere(p: { anyway?: boolean; head?: string }) {
  if (p.head) return `Merged at head ${p.head.slice(0, 12)}, as you accepted it.`;
  return p.anyway ? 'Merged at the commit its proof covers.' : 'Approved and merged at the verified commit.';
}
