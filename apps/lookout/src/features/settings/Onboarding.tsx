import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Panel, ScoutBadge, TeamtrailLogo, Wordmark, Label, Choice, Button } from '../../components/ui';
import type { Prefs, TrackerChoice } from '../../lib';
import { GitHubSetup, LinearSetup, useTrackerSettings, trackerApi, switchTracker, willUse } from '../trackers';
import { SettingsSection } from './SettingsSection';
import { TranscriptChoice } from './TranscriptChoice';

export function Onboarding(props: { prefs: Prefs; update: (p: Partial<Prefs>) => void; activeTracker: TrackerChoice }) {
  const { prefs, update } = props;
  // Polled, so `gh auth login` in a terminal shows up here without a reload.
  const [trackers] = useTrackerSettings(5000);
  const [busy, setBusy] = useState(false);
  const gh = trackers?.github;
  /** Who and where GitHub would use, said before anything connects; once chosen, its setup below says it. */
  let ghSub: string | undefined;
  if (gh && prefs.tracker !== 'github') ghSub = willUse(gh, gh.repo ?? gh.detectedRepo);
  const choices: { id: TrackerChoice; title: string; sub?: string }[] = [
    { id: 'markdown', title: 'Local markdown', sub: 'Files in .teamtrail/ in this repo' },
    { id: 'github', title: 'GitHub Issues', sub: ghSub ?? 'Trails as labelled issues in your repo' },
    { id: 'linear', title: 'Linear', sub: 'Trails and tickets in your Linear team' },
  ];
  /** GitHub and Linear connect with their own Connect button, which finishes onboarding; nothing connects on choice. */
  const connectedHere = trackers?.active === prefs.tracker && prefs.tracker === 'github';
  const needsSetup = (prefs.tracker === 'github' && !connectedHere) || prefs.tracker === 'linear';
  const finish = (tracker: TrackerChoice) => {
    update({ onboarded: true });
    switchTracker(update, tracker);
  };
  const start = async () => {
    setBusy(true);
    if (prefs.tracker === 'markdown' && trackers) await trackerApi.connect({ active: 'markdown' }).catch(() => {});
    update({ onboarded: true });
    if (prefs.tracker !== props.activeTracker) switchTracker(update, prefs.tracker);
  };
  return (
    <div className="scrim">
      <Panel as="div" className="dialog onboarding">
        <div className="onb-brand">
          <TeamtrailLogo size={64} />
          <Wordmark as="div" className="onb-title" />
        </div>
        <div className="onb-cat mono-label">{BRAND.category}</div>
        <p className="onb-tagline">{BRAND.tagline}</p>
        <p className="scout-line">
          <Label>
            <ScoutBadge className="voice-badge" /> {BRAND.assistant.name}
          </Label>{' '}
          Where should your trails live?
        </p>

        <SettingsSection title="Tracker">
          <div className="choice-row">
            {choices.map((c) => (
              <Choice
                key={c.id}
                on={prefs.tracker === c.id}
                title={c.title}
                sub={c.sub}
                onClick={() => update({ tracker: c.id })}
              />
            ))}
          </div>
          {trackers && prefs.tracker === 'github' && !connectedHere && (
            <GitHubSetup s={trackers} onConnected={() => finish('github')} />
          )}
          {trackers && prefs.tracker === 'linear' && <LinearSetup s={trackers} onConnected={() => finish('linear')} />}
        </SettingsSection>

        <SettingsSection title="HITL transcript">
          <TranscriptChoice value={prefs.hitlTranscript} onChange={(hitlTranscript) => update({ hitlTranscript })} />
        </SettingsSection>

        <footer>
          <Button variant="primary" disabled={busy || needsSetup} onClick={() => void start()}>
            Get started
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
