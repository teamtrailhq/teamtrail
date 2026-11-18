import type { AttentionItem } from '@teamtrail/core';
import { Button, MetaLine } from '../../components/ui';
import { detailReasons, openItem } from '../attention';
import type { NeedContext } from './types';

/** Kinds handled outside a ticket, and the words for going there. */
const PLACE: Partial<Record<AttentionItem['kind'], string>> = {
  brief: 'Review the brief',
  reroute: 'Review the change',
  'reroute-suggested': 'Review the change',
  trust: 'Open Approvals',
  guide: 'Review the guide',
  'guide-checks': 'Review the guide',
  knowledge: 'Open the field guide',
  delivery: 'Open its settings',
  escape: 'Add a rule',
};

/**
 * An item handled in its own place (the brief, a reroute, Approvals, a guide) or on another trail: why it ranks
 * here, then the way there; a ticket's item opens its full ticket.
 */
export function ItemBody({ item, ctx }: { item: AttentionItem; ctx: NeedContext }) {
  const reasons = detailReasons(item);
  const ticketId = item.ticketId;
  const label = PLACE[item.kind] ?? (ticketId ? undefined : 'Open');
  return (
    <>
      {reasons.length > 0 && <MetaLine parts={reasons} />}
      <div className="home-need-links">
        {label && (
          <Button size="sm" variant="primary" onClick={() => openItem(item, ctx.handlers)}>
            {label}
          </Button>
        )}
        {ticketId && (
          <button type="button" className="link" onClick={() => ctx.openTicket(item.mapId, ticketId)}>
            Open ticket
          </button>
        )}
      </div>
    </>
  );
}
