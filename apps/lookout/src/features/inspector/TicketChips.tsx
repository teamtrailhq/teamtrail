import { Tag } from '../../components/ui';
import type { TicketChip } from './types';

/** The ticket's chips in one wrapping row, as on its map card: key, type, state, agent and model, proof, risk. */
export function TicketChips({ chips }: { chips: TicketChip[] }) {
  return (
    <div className="ticket-chips">
      {chips.map((c) => (
        <Tag key={c.kind} tone={c.tone} code={c.kind === 'key'} className={`tag-${c.kind}`} tip={c.tip}>
          {c.text}
        </Tag>
      ))}
    </div>
  );
}
