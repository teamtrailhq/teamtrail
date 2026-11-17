import { Fact } from '../../components/ui';
import { LEVEL_TEXT } from '../../lib/verification';
import { TicketGuides } from '../guides';
import { LevelControl } from '../verification';
import type { ReasonRequest } from './useTicketActions';
import type { TicketView } from './useTicketView';

/** The trail lead's edits to an open ticket's How: its guides, and its verification level, for this ticket alone. */
export function HowEditor({ v, act }: { v: TicketView; act: (req: ReasonRequest) => Promise<unknown> }) {
  return (
    <dl className="facts how-editor">
      <Fact label="Guides">
        <TicketGuides map={v.snap.map} ticket={v.t} />
      </Fact>
      <Fact label="Verification">
        <LevelControl
          value={v.t.verification}
          inherit={`Trail (${LEVEL_TEXT[v.snap.map.verification ?? 'off']})`}
          onChange={(level) => void act({ action: 'level', level })}
        />
      </Fact>
    </dl>
  );
}
