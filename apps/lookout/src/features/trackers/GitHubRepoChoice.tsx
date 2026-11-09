import type { GitHubRepoList } from '@teamtrail/core';
import { LoadFailed, Loading, MetaLine } from '../../components/ui';
import { RepoPicker } from './RepoPicker';

/** The picker once the repo list has loaded; skeleton rows while it loads, and Retry when GitHub couldn't list repos. */
export function GitHubRepoChoice(props: {
  list?: GitHubRepoList;
  detected?: string;
  value: string;
  onChange: (repo: string) => void;
  onRetry: () => void;
}) {
  const { list } = props;
  if (!list) return <Loading label="Loading your repos…" rows={3} className="picker-loading" />;
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
          <LoadFailed what="Couldn't list your repos" reason={list.error} onRetry={props.onRetry} />
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
