import type { TrackerAdapter } from '../adapters/adapter';
import type { GitEvidence } from '../model/evidence';
import type { Ticket } from '../model/types';
import type { VerificationAttempt, VerificationConfig } from '../model/verification';
import { DEFAULT_CONFIG } from '../verification/config';
import type { ConfigRead } from '../verification/configFile';
import type { ChecksOutcome } from '../verification/runChecks';
import { collectEvidence } from './collectEvidence';
import { flagEffect } from './flags';
import { staleness } from './stale';

export interface CompletionContext {
  adapter: TrackerAdapter;
  root: string;
  repoRoot: string;
  mapId: string;
  ticket: Ticket;
  config: ConfigRead;
  noCodeReason?: string;
  touches?: string[];
}

/** Git evidence for an attempt. Evidence never stops verification: a failure to read it is an info flag. */
export async function completionEvidence(c: CompletionContext): Promise<GitEvidence> {
  try {
    const snap = await c.adapter.loadMap(c.mapId);
    const ticket = snap.tickets.find((x) => x.id === c.ticket.id) ?? c.ticket;
    return await collectEvidence({
      root: c.root,
      cwd: c.repoRoot,
      snap,
      ticket,
      config: c.config.config,
      configHash: c.config.hash,
      noCodeReason: c.noCodeReason,
      touches: c.touches,
    });
  } catch (e) {
    return {
      v: 1,
      changed: [],
      stats: { files: 0, add: 0, del: 0 },
      ...(c.config.hash ? { configHash: c.config.hash } : {}),
      flags: [{ kind: 'no-git', level: 'info', message: `git evidence unavailable: ${(e as Error).message}` }],
    };
  }
}

/** The attempt's result when a flag decides it before any check runs (verification.json edited, no changes). */
export function gateOutcome(ev: GitEvidence): ChecksOutcome | undefined {
  const g = flagEffect(ev.flags);
  if (!g) return undefined;
  return { checks: [], result: g.effect === 'human' ? 'error' : 'fail', note: g.reason };
}

/** A pass on code that changed while the checks ran is run once more under the `reverify` policy. */
export const reverifies = (a: VerificationAttempt, config: VerificationConfig | undefined, already: boolean) =>
  !already &&
  a.result === 'pass' &&
  (config ?? DEFAULT_CONFIG).stale === 'reverify' &&
  !!a.git?.flags.some((f) => f.kind === 'stale');

/** Adds a `stale` flag when the code changed while the checks ran; returns whether it did. */
export async function flagIfStale(root: string, ev: GitEvidence) {
  const s = await staleness(root, ev).catch(() => undefined);
  if (!s?.stale) return false;
  ev.flags.push({ kind: 'stale', level: 'warn', message: `${s.reason}: the result may not hold for the code now` });
  return true;
}
