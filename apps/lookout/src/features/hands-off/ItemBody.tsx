import type { AttentionItem } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { detailReasons, ItemAction, openItem } from '../attention';
import { NeedWhy } from './NeedWhy';
import { placeLabel } from './placeLabel';
import type { NeedContext } from './types';

/**
 * An item handled in its own place (the brief, a reroute, Approvals, a guide) or on another trail: why it ranks
 * here, its one-click action when it has one (changed tracker settings, clashing branches), then the way there; a
 * ticket's item opens its full ticket.
 */
export function ItemBody({ item, ctx }: { item: AttentionItem; ctx: NeedContext }) {
  const reasons = detailReasons(item);
  const ticketId = item.ticketId;
  const label = placeLabel(item, ctx.api.mapId);
  return (
    <>
      <NeedWhy parts={reasons} />
      <ItemAction item={item} />
      {(label || ticketId) && (
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
      )}
    </>
  );
}
