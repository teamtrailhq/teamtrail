import { AGENT_INTEGRATIONS } from '@teamtrail/core';
import { Choice } from '../../components/ui';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';
import { ThemeChoice } from './ThemeChoice';
import { TranscriptChoice } from './TranscriptChoice';
import type { SettingsData } from './types';

/** Settings → You: appearance, the HITL transcript and the coding agent. */
export function YouGroup({ data }: { data: SettingsData }) {
  const { prefs, update } = data;
  return (
    <>
      <SettingsSlot id="appearance" storage="browser">
        <SettingsSection title="Appearance">
          <ThemeChoice value={prefs.theme} onChange={(theme) => update({ theme })} />
        </SettingsSection>
      </SettingsSlot>
      <SettingsSlot id="transcript" storage="browser">
        <SettingsSection title="HITL transcript">
          <TranscriptChoice value={prefs.hitlTranscript} onChange={(hitlTranscript) => update({ hitlTranscript })} />
        </SettingsSection>
      </SettingsSlot>
      <SettingsSlot id="agent">
        <SettingsSection title="Agent">
          <div className="choice-row">
            {AGENT_INTEGRATIONS.map((a) => (
              <Choice key={a.id} on={a.status === 'primary'} disabled={a.status !== 'primary'} title={a.name} />
            ))}
          </div>
        </SettingsSection>
      </SettingsSlot>
    </>
  );
}
