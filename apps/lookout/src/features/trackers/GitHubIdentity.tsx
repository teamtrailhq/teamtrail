import type { TrackerSettings } from '@teamtrail/core';
import { willUse } from './githubText';

/**
 * Who and where, before connecting: "Will use owner/name as login (your gh login)", a way to use another token, and
 * Sign out when the token is the one from Sign in with GitHub.
 */
export function GitHubIdentity(props: {
  gh: TrackerSettings['github'];
  repo: string;
  onUseAnother: () => void;
  onSignOut: () => void;
}) {
  const { gh } = props;
  if (!gh.auth) return null;
  const line = willUse(gh, props.repo);
  return (
    <div className="gh-identity">
      {line && <span className="t-body">{line}</span>}
      <span className="gh-identity-actions">
        <button type="button" className="btn ghost sm" onClick={props.onUseAnother}>
          Use another token
        </button>
        {gh.auth === 'signed-in' && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={props.onSignOut}
            title="Forgets the token on this machine. To revoke it, remove Teamtrail under GitHub → Settings → Applications."
          >
            Sign out
          </button>
        )}
      </span>
    </div>
  );
}
