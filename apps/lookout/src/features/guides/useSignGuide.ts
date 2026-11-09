import type { SignGuide } from './types';
import { useGuides } from './useGuides';

/**
 * What a map card shows of a ticket's guide: its name, the full name and version (or why agents can't use it) for
 * the tooltip, and whether it's off. Nothing for a ticket without a guide.
 */
export function useSignGuide(id?: string): SignGuide | undefined {
  const { view, find } = useGuides();
  if (!id) return undefined;
  const r = find(id);
  const off = view !== undefined && view !== null && r?.status !== 'active';
  const name = r?.guide?.name ?? id;
  const full = r?.guide ? `${name} ${r.guide.version}` : name;
  const tip = off ? `Guide ${full}: ${r?.reason ?? 'not installed'}` : `Guide: ${full}`;
  return { id, name, tip, off };
}
