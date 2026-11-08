import type { InstalledGuide } from '../model/guide';
import type { TicketType } from '../model/types';

/**
 * Why `id` can't be given to a ticket (of `type`) or a team, or undefined when it can: it must be installed, active
 * and, for a ticket, made for its type. The message lists the guides that can be used.
 */
export function guideProblem(guides: InstalledGuide[], id: string, type?: TicketType): string | undefined {
  const usable = guides.filter((r) => r.status === 'active' && r.guide);
  const list = `Usable guides: ${usable.map((r) => r.id).join(', ') || 'none'}.`;
  const r = guides.find((x) => x.id === id);
  if (!r) return `Unknown guide "${id}". ${list}`;
  if (r.status !== 'active' || !r.guide) return `Guide ${id} can't be used now (${r.reason ?? r.status}). ${list}`;
  const types = r.guide.handles.types;
  if (type && !types.includes(type)) return `Guide ${id} is for ${types.join(', ')} tickets, not ${type}.`;
  return undefined;
}
