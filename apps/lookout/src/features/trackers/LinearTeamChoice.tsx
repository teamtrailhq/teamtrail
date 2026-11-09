import type { LinearTeamList } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { TeamPicker } from './TeamPicker';

/** The team picker once the list has loaded; a quiet line while it loads, without a key, or when Linear refused. */
export function LinearTeamChoice(props: { list?: LinearTeamList; value: string; onChange: (teamId: string) => void }) {
  const { list } = props;
  if (!list) return <MetaLine parts={['Loading your teams…']} />;
  switch (list.kind) {
    case 'ok':
      return <TeamPicker teams={list.teams} truncated={list.truncated} value={props.value} onChange={props.onChange} />;
    case 'no-key':
      return <MetaLine parts={['Paste a Linear API key to list your teams']} />;
    case 'error':
      return <MetaLine parts={["Couldn't list your teams", list.error]} />;
    default: {
      const never: never = list;
      return never;
    }
  }
}
