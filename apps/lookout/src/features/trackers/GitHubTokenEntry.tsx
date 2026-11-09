import type { TrackerSettings } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { Credential } from './Credential';
import { tokenFrom } from './githubText';

/** No token found (or another one wanted): paste one, or sign in with the gh CLI and Teamtrail finds it. */
export function GitHubTokenEntry(props: {
  gh: TrackerSettings['github'];
  token: string;
  onToken: (t: string) => void;
  repo: string;
  onRepo: (r: string) => void;
}) {
  const { gh } = props;
  const refused =
    gh.auth && gh.account?.kind === 'unknown' ? `Found ${tokenFrom(gh.auth)}, but GitHub didn't accept it` : '';
  const why = gh.account?.kind === 'unknown' ? gh.account.error : '';
  return (
    <>
      {refused && <MetaLine parts={[refused, why]} />}
      <Credential
        source={null}
        value={props.token}
        onChange={props.onToken}
        label="Token"
        placeholder="ghp_… or github_pat_…"
        link={{ href: 'https://github.com/settings/personal-access-tokens/new', text: 'New token' }}
      />
      <span className="t-meta">
        Or run <code className="t-code">gh auth login</code> in a terminal; this finds it in a few seconds.
      </span>
      <label className="field">
        Repository
        <input
          value={props.repo}
          placeholder="owner/name"
          spellCheck={false}
          onChange={(e) => props.onRepo(e.target.value.trim())}
        />
      </label>
    </>
  );
}
