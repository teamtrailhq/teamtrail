import { levelOf, type VerificationLevel } from '../../model/lifecycle';
import type { ModelMatching } from '../../model/types';
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
  guides?: string[];
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

/** The settings in a parsed marker, read leniently and always in the same shape, so two can be compared as text. */
export function settingsOf(meta: Record<string, unknown>): BodySettings {
  const verification = levelOf(meta.verification);
  const guides = strings(meta.guides);
  const modelMatching = sortedMatching(meta.modelMatching);
  return {
    ...(verification ? { verification } : {}),
    ...(Array.isArray(meta.checks) ? { checks: strings(meta.checks) } : {}),
    ...(typeof meta.guide === 'string' && meta.guide ? { guide: meta.guide } : {}),
    ...(guides.length ? { guides } : {}),
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
  ['guides', 'guides'],
  ['modelMatching', 'model matching'],
];

function shown(v: BodySettings[keyof BodySettings]): string {
  if (v === undefined) return 'not set';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ') || 'none';
  return v.enabled ? 'on' : 'off';
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
