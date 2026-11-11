import { MAP_LABEL, BRAND, HITL_LABEL, PLAN_ONLY_LABEL } from '@teamtrail/core';
import { ApprovalsSection } from '../approvals';
import { GuidesSection } from '../guides';
import { RemoteAgentsSection } from '../remote-agents';
import { TrackerConnectors } from '../trackers';
import { RiskPolicySection } from './RiskPolicySection';
import { SettingsSection } from './SettingsSection';
import { SettingsSlot } from './SettingsSlot';
import type { SettingsData, SettingsRoute } from './types';
import { WorkspacesSection } from './WorkspacesSection';

/** Settings → Project: what this machine approved, the tracker, workspaces, remote agents, risk policy, guides and the labels Teamtrail uses. */
export function ProjectGroup({ data, route }: { data: SettingsData; route: SettingsRoute }) {
  return (
    <>
      <SettingsSlot id="approvals" storage="machine">
        <ApprovalsSection />
      </SettingsSlot>
      <SettingsSlot id="tracker">
        <SettingsSection title="Tracker">
          <TrackerConnectors activeTracker={data.activeTracker} location={data.location} update={data.update} />
        </SettingsSection>
      </SettingsSlot>
      <SettingsSlot id="workspaces" storage="repo">
        <WorkspacesSection />
      </SettingsSlot>
      <SettingsSlot id="remote-agents" storage="machine">
        <RemoteAgentsSection />
      </SettingsSlot>
      <SettingsSlot id="policy" storage="repo">
        <RiskPolicySection />
      </SettingsSlot>
      <SettingsSlot id="guides" storage="repo">
        <GuidesSection focus={route.section === 'guides'} />
      </SettingsSlot>
      <SettingsSlot id="labels">
        <SettingsSection title="Labels">
          <div className="label-codes">
            <code>{MAP_LABEL}</code>
            <code>{BRAND.labelPrefix}:&lt;type&gt;</code>
            <code>{HITL_LABEL}</code>
            <code>{PLAN_ONLY_LABEL}</code>
          </div>
        </SettingsSection>
      </SettingsSlot>
    </>
  );
}
