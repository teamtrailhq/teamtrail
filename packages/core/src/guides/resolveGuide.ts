import type { InstalledGuide, GuideDoc, GuidePayload, GuideStatus } from '../model/guide';
import type { Ticket } from '../model/types';

/** The guide a ticket asks for, as it can be used now. */
export type ResolvedGuide =
  | { kind: 'none' }
  | { kind: 'active'; guide: GuideDoc; installed: InstalledGuide }
  | {
      kind: 'disabled';
      id: string;
      status: Exclude<GuideStatus, 'active'> | 'missing';
      reason: string;
      /** The required checks of the last approved version, which still apply. */
      requiresChecks: string[];
    };

/** The guide of `t`: none, active, or disabled (unknown, unapproved, tampered or invalid) with the reason. */
export function resolveGuide(guides: InstalledGuide[], t: Pick<Ticket, 'guide'>): ResolvedGuide {
  if (!t.guide) return { kind: 'none' };
  const r = guides.find((x) => x.id === t.guide);
  if (!r) return { kind: 'disabled', id: t.guide, status: 'missing', reason: 'not installed', requiresChecks: [] };
  if (r.status === 'active' && r.guide) return { kind: 'active', guide: r.guide, installed: r };
  const status = r.status === 'active' ? 'invalid' : r.status;
  const requiresChecks = r.lock?.requiresChecks ?? [];
  return { kind: 'disabled', id: r.id, status, reason: r.reason ?? 'not usable', requiresChecks };
}

/** The checks a guide adds; a disabled guide keeps adding the ones its approved version required. */
export const requiredChecksOf = (r: ResolvedGuide): string[] => {
  if (r.kind === 'active') return r.guide.requiresChecks;
  if (r.kind === 'disabled') return r.requiresChecks;
  return [];
};

/** `base` with the guide's required checks appended. Only ever adds: a guide can't drop or reorder a check. */
export function effectiveChecks(base: string[], r: ResolvedGuide): string[] {
  const extra = requiredChecksOf(r).filter((c) => !base.includes(c));
  return extra.length ? [...base, ...extra] : base;
}

/** What a claim tells the agent about its guide. */
export const guidePayload = (guide: GuideDoc): GuidePayload => ({
  id: guide.id,
  name: guide.name,
  version: guide.version,
  instructions: guide.instructions,
  checklist: guide.checklist,
  requiredChecks: guide.requiresChecks,
  ...(guide.preferredAgent ? { preferredAgent: guide.preferredAgent } : {}),
});
