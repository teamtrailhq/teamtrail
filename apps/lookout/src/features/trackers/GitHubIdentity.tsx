import type { TrackerSettings } from '@teamtrail/core';
import { willUse } from './githubText';

/** Who and where, before connecting: "Will use owner/name as login (your gh login)", and a way to use another token. */
export function GitHubIdentity(props: { gh: TrackerSettings['github']; repo: string; onUseAnother: () => void }) {
  const { gh } = props;
  if (!gh.auth) return null;
  const line = willUse(gh, props.repo);
  return (
    <div className="gh-identity">
      {line && <span className="t-body">{line}</span>}
      <button type="button" className="btn ghost sm" onClick={props.onUseAnother}>
        Use another token
      </button>
    </div>
  );
}
