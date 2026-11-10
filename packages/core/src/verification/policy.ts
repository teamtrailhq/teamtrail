import { VERIFICATION_LEVELS, type VerificationLevel } from '../model/lifecycle';
import type { MapDoc, Ticket } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { DEFAULT_CONFIG } from './config';

export interface LevelInfo {
  level: VerificationLevel;
  /** Where the level came from: a ticket override, the trail, or nothing set (off). */
  source: 'ticket' | 'trail' | 'none';
  /** Check names to run, in order. */
  checks: string[];
  /** The ticket's or trail's settings came from someone else and wait for the human: completions wait too. */
  unconfirmed?: true;
}

/**
 * The verification a ticket's completion needs. A ticket override wins; else
 * the trail level, for the ticket types it applies to; else off. The config
 * `default` is only used when a trail is created, so trails that predate
 * verification stay off. Settings nobody here confirmed (`settingsUnconfirmed`) are never weaker: see below.
 */
export function verificationFor(config: VerificationConfig | undefined, map: MapDoc, t: Ticket): LevelInfo {
  const c = config ?? DEFAULT_CONFIG;
  if (t.settingsUnconfirmed || map.settingsUnconfirmed) return unconfirmedLevel(c, map, t);
  const checks = t.checks ?? c.run;
  if (t.verification) return { level: t.verification, source: 'ticket', checks };
  if (map.verification && c.appliesTo.includes(t.type)) return { level: map.verification, source: 'trail', checks };
  return { level: 'off', source: 'none', checks };
}

const rank = (v: VerificationLevel | undefined) => (v ? VERIFICATION_LEVELS.indexOf(v) : -1);
const stricter = (levels: (VerificationLevel | undefined)[]) =>
  levels.reduce<VerificationLevel | undefined>((a, b) => (rank(b) > rank(a) ? b : a), undefined);

/**
 * Settings someone else wrote that this machine never confirmed (a new machine, a lost record): the stricter of
 * every level that could apply (the ticket's, the trail's, the project default) and the project's checks plus the
 * ticket's. Never weaker than what is found or what the project asks for; the human then sets them.
 */
function unconfirmedLevel(c: VerificationConfig, map: MapDoc, t: Ticket): LevelInfo {
  const trail = c.appliesTo.includes(t.type) ? [map.verification, map.settingsUnconfirmed && c.default] : [];
  const level = stricter([t.verification, ...trail.filter((l): l is VerificationLevel => !!l)]) ?? 'off';
  const source = t.verification === level ? 'ticket' : 'trail';
  const checks = [...new Set([...c.run, ...(t.checks ?? [])])];
  return { level, source: level === 'off' ? 'none' : source, checks, unconfirmed: true };
}
