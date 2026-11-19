import type { PrChoice } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';

const STATE: Record<PrChoice['state'], string> = { open: 'open', merged: 'merged', closed: 'closed' };

/** A pull request the ticket could be linked to: number and title, then its state, branch, and whether it's the ticket's. */
export function PrChoiceRow(props: { pr: PrChoice; linked: boolean; busy: boolean; onPick: () => void }) {
  const { pr, linked } = props;
  const state = pr.state === 'open' && pr.draft ? 'draft' : STATE[pr.state];
  return (
    <Row
      as="li"
      className="pr-choice"
      selected={linked}
      title={
        <>
          <span className="t-code">#{pr.number}</span> {pr.title}
        </>
      }
      titleText={pr.title}
      context={
        <MetaLine
          parts={[
            state,
            pr.headRef && { text: pr.headRef, code: true },
            pr.forTicket && 'for this ticket',
            linked && 'linked now',
          ]}
        />
      }
      {...(linked || props.busy ? {} : { onOpen: props.onPick })}
    />
  );
}
