import type { LinearTeamOption } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { activeLabel } from './linearText';

/** One team in the picker: its name, then its key and how recently its issues moved. */
export function TeamRow(props: { team: LinearTeamOption; selected: boolean; now: number; onPick: () => void }) {
  const { team } = props;
  return (
    <Row
      as="li"
      className="repo-row team-row"
      selected={props.selected}
      title={team.name}
      context={<MetaLine parts={[{ text: team.key, code: true }, activeLabel(team, props.now)]} />}
      onOpen={props.onPick}
    />
  );
}
