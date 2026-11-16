import { levelOf, type VerificationLevel } from '../../model/lifecycle';
import { ALL_TICKET_TYPES, type GuidesByType, type ModelMatching } from '../../model/types';
import { modelMatchingOf } from '../modelMatchingOf';

/**
 * The part of an issue's meta marker that decides how much a completion has to prove and what agents are told:
 * the verification level, the checks to run, the guide (a trail's guides) and model matching. Unlike a claim or a
 * status, these are only taken from the tracker when this machine put or accepted them (settingsInForce.ts).
 */
export interface BodySettings {
  verification?: VerificationLevel;
  checks?: string[];
  guide?: string;
  guidesAdded?: string[];
  guidesRemoved?: string[];
  guides?: string[];
  guidesByType?: GuidesByType;
  modelMatching?: ModelMatching;
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);

/** Model matching with its tiers in one order, so the same setting always reads as the same text. */
function sortedMatching(raw: unknown): ModelMatching | undefined {
  const m = modelMatchingOf(raw);
  if (!m?.tiers) return m;
  const tiers = Object.fromEntries(Object.entries(m.tiers).sort(([a], [b]) => a.localeCompare(b)));
  return { enabled: m.enabled, tiers };
}

/** A trail's guides by type in one order, each type's ids once; `{}` (no guides for any type) is kept as it is. */
function sortedGuidesByType(raw: unknown): GuidesByType | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const pairs = ALL_TICKET_TYPES.map((type) => [type, [...new Set(strings(r[type]))]] as const);
  return Object.fromEntries(pairs.filter(([, ids]) => ids.length));
}

const listed = (key: string, v: unknown) => (strings(v).length ? { [key]: strings(v) } : {});

/** The settings in a parsed marker, read leniently and always in the same shape, so two can be compared as text. */
export function settingsOf(meta: Record<string, unknown>): BodySettings {
  const verification = levelOf(meta.verification);
  const guides = strings(meta.guides);
  const modelMatching = sortedMatching(meta.modelMatching);
  const guidesByType = sortedGuidesByType(meta.guidesByType);
  return {
    ...(verification ? { verification } : {}),
    ...(Array.isArray(meta.checks) ? { checks: strings(meta.checks) } : {}),
    ...(typeof meta.guide === 'string' && meta.guide ? { guide: meta.guide } : {}),
    ...listed('guidesAdded', meta.guidesAdded),
    ...listed('guidesRemoved', meta.guidesRemoved),
    ...(guides.length ? { guides } : {}),
    ...(guidesByType ? { guidesByType } : {}),
    ...(modelMatching ? { modelMatching } : {}),
  };
}

export const settingsKey = (s: BodySettings) => JSON.stringify(settingsOf({ ...s }));

export function settingsFromKey(key: string | undefined): BodySettings {
  if (!key) return {};
  try {
    const v: unknown = JSON.parse(key);
    return v && typeof v === 'object' ? settingsOf(v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const LABELS: [keyof BodySettings, string][] = [
  ['verification', 'verification level'],
  ['checks', 'checks'],
  ['guide', 'guide'],
  ['guidesAdded', 'guides added'],
  ['guidesRemoved', 'guides removed'],
  ['guides', 'guides'],
  ['guidesByType', 'guides by type'],
  ['modelMatching', 'model matching'],
];

function shown(v: BodySettings[keyof BodySettings]): string {
  if (v === undefined) return 'not set';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ') || 'none';
  if ('enabled' in v) return v.enabled ? 'on' : 'off';
  const types = Object.entries(v as GuidesByType).map(([type, ids]) => `${type} ${(ids ?? []).join(', ')}`);
  return types.join('; ') || 'none';
}

/** The settings themselves, one plain line each: `verification level: checks+review`. */
export const settingsLines = (s: BodySettings) => settingsChanges({}, s).map((l) => l.replace(/not set → /, ''));

/** What differs between two sets of settings, one plain line each: `verification level: checks → off`. */
export function settingsChanges(from: BodySettings, to: BodySettings): string[] {
  return LABELS.filter(([k]) => JSON.stringify(from[k]) !== JSON.stringify(to[k])).map(([k, label]) => {
    const [a, b] = [shown(from[k]), shown(to[k])];
    return a === b ? `${label} changed` : `${label}: ${a} → ${b}`;
  });
}
