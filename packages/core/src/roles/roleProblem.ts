import type { InstalledRole } from '../model/role';
import type { TicketType } from '../model/types';

/**
 * Why `id` can't be given to a ticket (of `type`) or a team, or undefined when it can: it must be installed, active
 * and, for a ticket, made for its type. The message lists the roles that can be used.
 */
export function roleProblem(roles: InstalledRole[], id: string, type?: TicketType): string | undefined {
  const usable = roles.filter((r) => r.status === 'active' && r.role);
  const list = `Usable roles: ${usable.map((r) => r.id).join(', ') || 'none'}.`;
  const r = roles.find((x) => x.id === id);
  if (!r) return `Unknown role "${id}". ${list}`;
  if (r.status !== 'active' || !r.role) return `Role ${id} can't be used now (${r.reason ?? r.status}). ${list}`;
  const types = r.role.handles.types;
  if (type && !types.includes(type)) return `Role ${id} is for ${types.join(', ')} tickets, not ${type}.`;
  return undefined;
}
