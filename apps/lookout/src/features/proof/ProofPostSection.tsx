import { useState } from 'react';
import { Button } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { useProofSettings } from './useProofSettings';

/** Settings → Project → Proof on pull requests: this machine posts each done ticket's proof to its open PR. Off by default. */
export function ProofPostSection() {
  const { enabled, set } = useProofSettings();
  const [error, setError] = useState<string>();
  if (enabled === undefined || enabled === null) return null;
  const toggle = () => {
    setError(undefined);
    set(!enabled).then(setError, (e: Error) => setError(e.message));
  };
  return (
    <SettingsSection title="Proof on pull requests">
      <p className="vf-intro">
        When a ticket is done and its pull request is open, post its Verified by Teamtrail report as one comment on the
        PR, with a <b>Teamtrail proof</b> check next to CI. The comment is updated, never repeated, when the proof or
        the PR changes.
      </p>
      <div className="att-settings-row set-field">
        <span className="set-field-label">Post proofs from this machine</span>
        <Button size="sm" on={enabled} aria-pressed={enabled} className="proof-post-toggle" onClick={toggle}>
          {enabled ? 'On' : 'Off'}
        </Button>
      </div>
      <span className="set-hint t-meta">
        Posted with your GitHub token, to the repo Teamtrail syncs pull requests with (<code>github</code> in
        verification.json). Only this machine posts: a teammate switches it on in their own Lookout. The check passes
        only when the ticket is verified at the PR&apos;s latest commit.
      </span>
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
