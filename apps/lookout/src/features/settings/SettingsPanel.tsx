import {
  type MapDoc,
  type MapMode,
  MAP_LABEL,
  BRAND,
  HITL_LABEL,
  PLAN_ONLY_LABEL,
  AGENT_INTEGRATIONS,
} from '@teamtrail/core';
import { useState, useEffect } from 'react';
import { Panel, Tabs, Choice } from '../../components/ui';
import type { Prefs, TrackerChoice } from '../../lib';
import { RolesSection, TeamSection } from '../roles';
import { TrackerConnectors } from '../trackers';
import { ModeChoice } from '../trail';
import { AttentionSection } from './AttentionSection';
import { BriefingChoice } from './BriefingChoice';
import { Changelog } from './Changelog';
import { RiskPolicySection } from './RiskPolicySection';
import { SettingsSection } from './SettingsSection';
import { SlackSection } from './SlackSection';
import { ThemeChoice } from './ThemeChoice';
import { TranscriptChoice } from './TranscriptChoice';
import { VerificationSection } from './VerificationSection';
import { WorkspacesSection } from './WorkspacesSection';

export function SettingsPanel(props: {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  activeTracker: TrackerChoice;
  location: string;
  map?: MapDoc;
  onMapMode: (m: MapMode) => void;
  onClose: () => void;
  initialTab?: 'settings' | 'changelog';
  focus?: 'slack' | 'roles';
}) {
  const { prefs, update } = props;
  const [tab, setTab] = useState(props.initialTab ?? 'settings');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  return (
    <div className="scrim" onClick={props.onClose}>
      <Panel as="div" className="dialog settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'settings', label: 'Settings' },
              { id: 'changelog', label: 'Changelog' },
            ]}
          />
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </header>

        {tab === 'changelog' ? (
          <Changelog />
        ) : (
          <>
            {props.map && (
              <SettingsSection title={`Trail ${props.map.key}`}>
                <ModeChoice value={props.map.mode} onChange={props.onMapMode} />
              </SettingsSection>
            )}

            <SettingsSection title="Tracker">
              <TrackerConnectors activeTracker={props.activeTracker} location={props.location} update={update} />
            </SettingsSection>

            <SlackSection focus={props.focus === 'slack'} />

            <VerificationSection map={props.map} />

            <RiskPolicySection />

            <AttentionSection />

            <WorkspacesSection />

            {props.map && <TeamSection map={props.map} />}

            <RolesSection focus={props.focus === 'roles'} />

            <SettingsSection title="Labels">
              <div className="label-codes">
                <code>{MAP_LABEL}</code>
                <code>{BRAND.labelPrefix}:&lt;type&gt;</code>
                <code>{HITL_LABEL}</code>
                <code>{PLAN_ONLY_LABEL}</code>
              </div>
            </SettingsSection>

            <SettingsSection title="HITL transcript">
              <TranscriptChoice
                value={prefs.hitlTranscript}
                onChange={(hitlTranscript) => update({ hitlTranscript })}
              />
            </SettingsSection>

            <SettingsSection title="Appearance">
              <ThemeChoice value={prefs.theme} onChange={(theme) => update({ theme })} />
            </SettingsSection>

            <SettingsSection title="Trip report">
              <BriefingChoice value={prefs.briefing} onChange={(briefing) => update({ briefing })} />
            </SettingsSection>

            <SettingsSection title="Agent">
              <div className="choice-row">
                {AGENT_INTEGRATIONS.map((a) => (
                  <Choice key={a.id} on={a.status === 'primary'} disabled={a.status !== 'primary'} title={a.name} />
                ))}
              </div>
            </SettingsSection>
          </>
        )}
      </Panel>
    </div>
  );
}
