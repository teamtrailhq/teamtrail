import { useState } from 'react';
import { Button } from '../../components/ui';
import { SectionIntro } from '../settings/SectionIntro';
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
      <SectionIntro
        lead="Post each done ticket's Verified by Teamtrail report on its open pull request, with a Teamtrail proof check."
        more={[
          'One comment per pull request, edited in place when the proof or the pull request changes.',
          <>
            Posted with your GitHub token, to the repo Teamtrail syncs pull requests with (<code>github</code> in
            verification.json).
          </>,
          'Only this machine posts: a teammate switches it on in their own Lookout.',
          "The check passes only when the ticket is verified at the pull request's latest commit.",
        ]}
      />
      <div className="att-settings-row set-field">
        <span className="set-field-label">Post proofs from this machine</span>
        <Button size="sm" on={enabled} aria-pressed={enabled} className="proof-post-toggle" onClick={toggle}>
          {enabled ? 'On' : 'Off'}
        </Button>
      </div>
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
