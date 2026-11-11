import { useEffect, useState } from 'react';
import { Panel, ScoutBadge, TeamtrailLogo, Wordmark, Choice, Button, Loading } from '../../components/ui';
import type { Prefs, TrackerChoice } from '../../lib';
import { GitHubSetup, LinearSetup, useTrackerSettings, trackerApi, switchTracker } from '../trackers';
import { onboardingChoices } from './onboardingChoices';
import { SettingsSection } from './SettingsSection';
import { TranscriptChoice } from './TranscriptChoice';

/** While the first settings load (the token lookup and who it is can take a moment). */
const CHECKING: Partial<Record<TrackerChoice, string>> = {
  github: 'Checking for a GitHub login…',
  linear: 'Checking for a Linear key…',
};

export function Onboarding(props: { prefs: Prefs; update: (p: Partial<Prefs>) => void; activeTracker: TrackerChoice }) {
  const { prefs, update } = props;
  // Polled, so `gh auth login` in a terminal shows up here without a reload.
  const [trackers, , reloadTrackers] = useTrackerSettings(5000);
  const [busy, setBusy] = useState(false);
  // The repo already names a tracker this machine hasn't approved (a clone of a team's repo): offer that one first.
  const asked = trackers?.pending?.target.split(':')[0] as TrackerChoice | undefined;
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (asked && !picked && prefs.tracker !== asked) update({ tracker: asked });
  }, [asked, picked, prefs.tracker, update]);
  const choices = onboardingChoices(trackers ?? undefined, prefs.tracker);
  /** GitHub and Linear connect with their own Connect button, which finishes onboarding; nothing connects on choice. */
  const remote = prefs.tracker === 'github' || prefs.tracker === 'linear';
  const connectedHere = remote && trackers?.active === prefs.tracker;
  const needsSetup = remote && !connectedHere;
  const finish = (tracker: TrackerChoice) => {
    update({ onboarded: true });
    switchTracker(update, tracker);
  };
  const start = async () => {
    setBusy(true);
    // Local files here never rewrite the team's trackers.json: that choice is made in Settings → Approvals.
    const ownFile = trackers && !trackers.pending;
    if (prefs.tracker === 'markdown' && ownFile) await trackerApi.connect({ active: 'markdown' }).catch(() => {});
    update({ onboarded: true });
    if (prefs.tracker !== props.activeTracker) switchTracker(update, prefs.tracker);
  };
  return (
    <div className="scrim">
      <Panel as="div" className="dialog onboarding">
        <div className="onb-brand">
          <TeamtrailLogo size={22} bare />
          <Wordmark className="onb-title" />
        </div>
        <h2 className="onb-question t-heading">
          <ScoutBadge className="voice-badge" size={22} />
          Where should your trails live?
        </h2>

        <SettingsSection title="Tracker">
          <div className="choice-row">
            {choices.map((c) => (
              <Choice
                key={c.id}
                on={prefs.tracker === c.id}
                title={c.title}
                sub={c.sub}
                onClick={() => (setPicked(true), update({ tracker: c.id }))}
              />
            ))}
          </div>
          {trackers?.pending && (
            <p className="t-meta onb-repo-tracker">
              This repo keeps its trails in {trackers.pending.label}. Connect it here, or keep local files on this
              machine; the team's choice in the repo isn't changed either way.
            </p>
          )}
          {trackers === undefined && remote && <Loading label={CHECKING[prefs.tracker] ?? 'Checking…'} />}
          {trackers && prefs.tracker === 'github' && !connectedHere && (
            <GitHubSetup s={trackers} reload={reloadTrackers} onConnected={() => finish('github')} />
          )}
          {trackers && prefs.tracker === 'linear' && !connectedHere && (
            <LinearSetup s={trackers} onConnected={() => finish('linear')} />
          )}
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
