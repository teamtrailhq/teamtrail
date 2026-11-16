import { AGENT_INTEGRATIONS } from '@teamtrail/core';
import { Choice } from '../../components/ui';
import { managedSignIn } from '../../lib/managedSignIn';
import { managedThemeFixed, shownTheme } from '../../lib/managedTheme';
import { DevicesSlot } from './DevicesSlot';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';
import { ThemeChoice } from './ThemeChoice';
import { TranscriptChoice } from './TranscriptChoice';
import type { SettingsData } from './types';

/** Settings → You: appearance, the HITL transcript, the coding agent, and the browsers signed in. */
export function YouGroup({ data }: { data: SettingsData }) {
  const { prefs, update } = data;
  return (
    <>
      <SettingsSlot id="appearance" storage="browser">
        <SettingsSection title="Appearance">
          {managedThemeFixed() ? (
            <p className="vf-intro">
              Follows the theme you picked in your account on the server. Change it from your name in its menu.
            </p>
          ) : (
            <ThemeChoice value={shownTheme(prefs.theme)} onChange={(theme) => update({ theme })} />
          )}
          {managedSignIn()?.themeSave && (
            <p className="vf-intro">Saved to your account, so the server's pages follow it.</p>
          )}
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
      <DevicesSlot />
    </>
  );
}
