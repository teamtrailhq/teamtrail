import type { LinearTeamList } from '@teamtrail/core';
import { LoadFailed, Loading, MetaLine } from '../../components/ui';
import { TeamPicker } from './TeamPicker';

/** The team picker once the list has loaded; skeleton rows while it loads, and Retry when Linear refused. */
export function LinearTeamChoice(props: {
  list?: LinearTeamList;
  value: string;
  onChange: (teamId: string) => void;
  onRetry: () => void;
}) {
  const { list } = props;
  if (!list) return <Loading label="Loading teams…" rows={3} className="picker-loading" />;
  switch (list.kind) {
    case 'ok':
      return <TeamPicker teams={list.teams} truncated={list.truncated} value={props.value} onChange={props.onChange} />;
    case 'no-key':
      return <MetaLine parts={['Paste a Linear API key to list your teams']} />;
    case 'error':
      return <LoadFailed what="Couldn't list your teams" reason={list.error} onRetry={props.onRetry} />;
    default: {
      const never: never = list;
      return never;
    }
  }
}
