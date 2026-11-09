import type { GitHubRepoList } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { RepoPicker } from './RepoPicker';

/** The picker once the repo list has loaded; a quiet line while it loads or when GitHub couldn't list repos. */
export function GitHubRepoChoice(props: {
  list?: GitHubRepoList;
  detected?: string;
  value: string;
  onChange: (repo: string) => void;
}) {
  const { list } = props;
  if (!list) return <MetaLine parts={['Loading your repos…']} />;
  switch (list.kind) {
    case 'ok':
      return (
        <RepoPicker
          repos={list.repos}
          truncated={list.truncated}
          detected={list.detectedRepo ?? props.detected}
          value={props.value}
          onChange={props.onChange}
        />
      );
    case 'no-token':
      return <MetaLine parts={['No GitHub token found']} />;
    case 'error':
      // Typing owner/name still works when GitHub won't list repos.
      return (
        <>
          <MetaLine parts={["Couldn't list your repos", list.error]} />
          <RepoPicker
            repos={[]}
            truncated={false}
            detected={props.detected}
            value={props.value}
            onChange={props.onChange}
          />
        </>
      );
    default: {
      const never: never = list;
      return never;
    }
  }
}
