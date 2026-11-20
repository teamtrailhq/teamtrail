import type { AttentionItem } from '@teamtrail/core';
import { openItem } from '../attention';
import { MainChecksSection } from '../main-checks';
import { ReadinessNeed } from '../readiness';
import { TrailChecksSection } from '../trail-checks';
import { ItemBody } from './ItemBody';
import { QuestionBody } from './QuestionBody';
import { TicketNeedBody } from './TicketNeedBody';
import type { NeedContext } from './types';

/**
 * What an open row shows: a question with its answers, checks failing on main with their ways on, a ticket on the
 * trail on screen with every action it has now, or else where the item is handled.
 */
export function NeedBody({ item, ctx }: { item: AttentionItem; ctx: NeedContext }) {
  const snap = ctx.api.allSnaps[item.mapId];
  const here = item.mapId === ctx.api.mapId;
  const ticket = item.ticketId ? snap?.tickets.find((t) => t.id === item.ticketId) : undefined;
  if (item.kind === 'question') return <QuestionBody item={item} ctx={ctx} />;
  if (item.kind === 'main-checks') return <MainChecksSection mapId={item.mapId} now={ctx.now} />;
  if (item.kind === 'readiness')
    return <ReadinessNeed mapId={ctx.api.mapId} now={ctx.now} onDetails={() => openItem(item, ctx.handlers)} />;
  if (item.kind === 'trail-checks') return <TrailChecksSection mapId={item.mapId} now={ctx.now} />;
  if (here && snap && ticket) return <TicketNeedBody key={ticket.id} item={item} snap={snap} t={ticket} ctx={ctx} />;
  return <ItemBody item={item} ctx={ctx} />;
}
