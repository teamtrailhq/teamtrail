import type { GitHubRepoOption } from '@teamtrail/core';
import { useMemo, useState } from 'react';
import { MetaLine } from '../../components/ui';
import { repoOptions } from './repoOptions';
import { RepoRow } from './RepoRow';

const LIMIT = 40;

/**
 * Pick the repo whose issues hold this project's trails: a searchable list of the repos the login can push or
 * triage in, this project's repo first. Typing `owner/name` offers a repo the list doesn't have.
 */
export function RepoPicker(props: {
  repos: GitHubRepoOption[];
  truncated: boolean;
  detected?: string;
  value: string;
  onChange: (repo: string) => void;
}) {
  const [query, setQuery] = useState('');
  const now = useMemo(() => Date.now(), []);
  const known = useMemo(() => new Set(props.repos.map((r) => r.fullName)), [props.repos]);
  const { shown, matches, typed } = repoOptions({ repos: props.repos, detected: props.detected, query, limit: LIMIT });
  const more = matches > shown.length ? `${matches - shown.length} more: type to narrow` : '';
  const cut = props.truncated ? `Your ${props.repos.length} most recently pushed repos` : '';
  return (
    <div className="repo-picker">
      <label className="field">
        Repository
        <input
          value={query}
          placeholder="Search your repos, or type owner/name"
          spellCheck={false}
          aria-label="Search repositories"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ul className="repo-list" aria-label="Repositories">
        {typed && (
          <RepoRow
            repo={{ fullName: typed, private: false }}
            detected={typed === props.detected}
            listed={false}
            selected={typed === props.value}
            now={now}
            onPick={() => props.onChange(typed)}
          />
        )}
        {shown.map((r) => (
          <RepoRow
            key={r.fullName}
            repo={r}
            detected={r.fullName === props.detected}
            listed={known.has(r.fullName)}
            selected={r.fullName === props.value}
            now={now}
            onPick={() => props.onChange(r.fullName)}
          />
        ))}
      </ul>
      <MetaLine parts={[!matches && !typed && 'No repo matches', more, cut]} />
    </div>
  );
}
