import { Empty } from '../../components/ui';
import { GatesSection } from '../gates';
import { TrailGuidesSection } from '../guides';
import { ModeChoice } from '../trail';
import { ModelMatchingSection } from './ModelMatchingSection';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';
import type { SettingsData } from './types';
import { VerificationSection } from './VerificationSection';

/** Settings → This trail: the trail on screen's mode, verification, gates, model matching and guides by type. */
export function TrailGroup({ data }: { data: SettingsData }) {
  const { map } = data;
  return (
    <>
      {map ? (
        <SettingsSlot id="mode">
          <SettingsSection title={`Trail ${map.key}`}>
            <ModeChoice value={map.mode} onChange={data.onMapMode} />
          </SettingsSection>
        </SettingsSlot>
      ) : (
        <Empty>Chart or pick a trail to set its mode, model matching and guides.</Empty>
      )}
      <SettingsSlot id="verification" storage="repo">
        <VerificationSection map={map} />
      </SettingsSlot>
      <SettingsSlot id="gates" storage="repo">
        <GatesSection onOpenTicket={data.onOpenTicket} />
      </SettingsSlot>
      <SettingsSlot id="models">
        <ModelMatchingSection map={map} snaps={data.snaps} answered={data.answered} onChange={data.onModelMatching} />
      </SettingsSlot>
      {map && (
        <SettingsSlot id="trail-guides">
          <TrailGuidesSection map={map} />
        </SettingsSlot>
      )}
    </>
  );
}
