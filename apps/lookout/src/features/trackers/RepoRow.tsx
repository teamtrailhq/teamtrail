import type { GitHubRepoOption } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { pushedLabel } from './githubText';

/** One repo in the picker: its name, then whether it's this project's repo, its visibility and last push. */
export function RepoRow(props: {
  repo: GitHubRepoOption;
  detected: boolean;
  /** False for a repo the list doesn't have: this project's origin past the cap, or a typed `owner/name`. */
  listed: boolean;
  selected: boolean;
  now: number;
  onPick: () => void;
}) {
  const { repo, listed } = props;
  const visibility = repo.private ? 'Private' : 'Public';
  return (
    <Row
      as="li"
      className="repo-row"
      selected={props.selected}
      title={<span className="t-code">{repo.fullName}</span>}
      context={
        <MetaLine
          parts={[
            props.detected && { text: "This project's repo", strong: true },
            listed && visibility,
            listed && pushedLabel(repo, props.now),
            !listed && 'Checked when you connect',
          ]}
        />
      }
      onOpen={props.onPick}
    />
  );
}
