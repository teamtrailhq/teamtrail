import { AlertsGroup } from './AlertsGroup';
import { Changelog } from './Changelog';
import { ProjectGroup } from './ProjectGroup';
import { ProjectsSection } from './ProjectsSection';
import { SettingsSlot } from './SettingsSlot';
import { TrailGroup } from './TrailGroup';
import type { SettingsData, SettingsGroupId, SettingsRoute } from './types';
import { YouGroup } from './YouGroup';

/** The sections of one Settings group, each rendered by its existing component. */
export function SettingsGroupBody(props: { group: SettingsGroupId; data: SettingsData; route: SettingsRoute }) {
  const { data, route } = props;
  switch (props.group) {
    case 'trail':
      return <TrailGroup data={data} />;
    case 'project':
      return <ProjectGroup data={data} route={route} />;
    case 'alerts':
      return <AlertsGroup data={data} route={route} />;
    case 'you':
      return <YouGroup data={data} />;
    case 'projects':
      return (
        <SettingsSlot id="projects" storage="machine">
          <ProjectsSection />
        </SettingsSlot>
      );
    case 'about':
      return (
        <SettingsSlot id="changelog">
          <Changelog />
        </SettingsSlot>
      );
    default: {
      const never: never = props.group;
      return never;
    }
  }
}
