import { Empty } from '../../components/ui';
import { TeamSection } from '../guides';
import { ModeChoice } from '../trail';
import { ModelMatchingSection } from './ModelMatchingSection';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';
import type { SettingsData } from './types';
import { VerificationSection } from './VerificationSection';

/** Settings → This trail: the trail on screen's mode, verification, model matching and team. */
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
        <Empty>Chart or pick a trail to set its mode, model matching and team.</Empty>
      )}
      <SettingsSlot id="verification" storage="repo">
        <VerificationSection map={map} />
      </SettingsSlot>
      <SettingsSlot id="models">
        <ModelMatchingSection map={map} snaps={data.snaps} answered={data.answered} onChange={data.onModelMatching} />
      </SettingsSlot>
      {map && (
        <SettingsSlot id="team">
          <TeamSection map={map} />
        </SettingsSlot>
      )}
    </>
  );
}
