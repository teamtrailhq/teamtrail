import type { GitHubRepoList } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { trackerApi } from './trackerApi';

/** The repos the found GitHub token can track issues in; undefined while loading or when `enabled` is off. */
export function useGitHubRepos(enabled: boolean) {
  const [list, setList] = useState<GitHubRepoList>();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    trackerApi.githubRepos().then(
      (l) => live && setList(l),
      (e: Error) => live && setList({ kind: 'error', error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return list;
}
