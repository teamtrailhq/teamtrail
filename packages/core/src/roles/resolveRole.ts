import type { InstalledRole, RoleDoc, RolePayload, RoleStatus } from '../model/role';
import type { Ticket } from '../model/types';

/** The role a ticket asks for, as it can be used now. */
export type ResolvedRole =
  | { kind: 'none' }
  | { kind: 'active'; role: RoleDoc; installed: InstalledRole }
  | {
      kind: 'disabled';
      id: string;
      status: Exclude<RoleStatus, 'active'> | 'missing';
      reason: string;
      /** The required checks of the last approved version, which still apply. */
      requiresChecks: string[];
    };

/** The role of `t`: none, active, or disabled (unknown, unapproved, tampered or invalid) with the reason. */
export function resolveRole(roles: InstalledRole[], t: Pick<Ticket, 'role'>): ResolvedRole {
  if (!t.role) return { kind: 'none' };
  const r = roles.find((x) => x.id === t.role);
  if (!r) return { kind: 'disabled', id: t.role, status: 'missing', reason: 'not installed', requiresChecks: [] };
  if (r.status === 'active' && r.role) return { kind: 'active', role: r.role, installed: r };
  const status = r.status === 'active' ? 'invalid' : r.status;
  const requiresChecks = r.lock?.requiresChecks ?? [];
  return { kind: 'disabled', id: r.id, status, reason: r.reason ?? 'not usable', requiresChecks };
}

/** The checks a role adds; a disabled role keeps adding the ones its approved version required. */
export const requiredChecksOf = (r: ResolvedRole): string[] => {
  if (r.kind === 'active') return r.role.requiresChecks;
  if (r.kind === 'disabled') return r.requiresChecks;
  return [];
};

/** `base` with the role's required checks appended. Only ever adds: a role can't drop or reorder a check. */
export function effectiveChecks(base: string[], r: ResolvedRole): string[] {
  const extra = requiredChecksOf(r).filter((c) => !base.includes(c));
  return extra.length ? [...base, ...extra] : base;
}

/** What a claim tells the agent about its role. */
export const rolePayload = (role: RoleDoc): RolePayload => ({
  id: role.id,
  name: role.name,
  version: role.version,
  instructions: role.instructions,
  checklist: role.checklist,
  requiredChecks: role.requiresChecks,
  ...(role.preferredAgent ? { preferredAgent: role.preferredAgent } : {}),
});
