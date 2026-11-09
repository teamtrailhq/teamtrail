import { AttentionSection } from './AttentionSection';
import { BriefingChoice } from './BriefingChoice';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';
import { SlackSection } from './SlackSection';
import type { SettingsData, SettingsRoute } from './types';

/** Settings → Attention & alerts: what interrupts you, Slack, and the trip report. */
export function AlertsGroup({ data, route }: { data: SettingsData; route: SettingsRoute }) {
  return (
    <>
      <SettingsSlot id="attention" storage="repo">
        <AttentionSection />
      </SettingsSlot>
      <SettingsSlot id="slack" storage="machine">
        <SlackSection focus={route.section === 'slack'} />
      </SettingsSlot>
      <SettingsSlot id="trip-report" storage="browser">
        <SettingsSection title="Trip report">
          <BriefingChoice value={data.prefs.briefing} onChange={(briefing) => data.update({ briefing })} />
        </SettingsSection>
      </SettingsSlot>
    </>
  );
}
