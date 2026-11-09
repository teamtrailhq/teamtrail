import type { TrackerSettings } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { Credential } from './Credential';
import { GitHubSignIn } from './GitHubSignIn';
import { tokenFrom } from './githubText';

/**
 * No token found (or another one wanted): Sign in with GitHub when Teamtrail has an OAuth app, paste a token, or
 * sign in with the gh CLI and Teamtrail finds it.
 */
export function GitHubTokenEntry(props: {
  gh: TrackerSettings['github'];
  token: string;
  onToken: (t: string) => void;
  repo: string;
  onRepo: (r: string) => void;
  onSignedIn: () => Promise<void> | void;
}) {
  const { gh } = props;
  const refused =
    gh.auth && gh.account?.kind === 'unknown' ? `Found ${tokenFrom(gh.auth)}, but GitHub didn't accept it` : '';
  const why = gh.account?.kind === 'unknown' ? gh.account.error : '';
  // $GITHUB_TOKEN / $GH_TOKEN come before a sign-in, so signing in would change nothing.
  const envToken = gh.auth === 'GITHUB_TOKEN' || gh.auth === 'GH_TOKEN';
  const canSignIn = gh.signIn.available && !envToken;
  return (
    <>
      {refused && <MetaLine parts={[refused, why]} />}
      {canSignIn && <GitHubSignIn onSignedIn={props.onSignedIn} />}
      {canSignIn && <span className="t-label gh-or">Or paste a token</span>}
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
