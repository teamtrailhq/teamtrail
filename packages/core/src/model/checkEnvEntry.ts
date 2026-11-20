import type { ActorKind } from './lifecycle';

/**
 * The trail lead adding or removing a variable name checks may read on this machine (Settings → Verification →
 * Variables checks can read). The name only: a value is never written anywhere.
 */
export interface CheckEnvEntry {
  v: 1;
  kind: 'check-env';
  at: number;
  mapId: string;
  action: 'added' | 'removed';
  name: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds those changes: `.events/_check-env.jsonl`. */
export const CHECK_ENV_JOURNAL = '_check-env';
