import type { EvidenceFlag } from '../model/evidence';
import type { FlagInput } from './flags';

const NO_CHANGES_EFFECT = { fail: '; completing needs a change', human: '; a human decides' } as const;

/**
 * The flag for a completion that changed no files: info when its ticket type allows it or the agent said why, else
 * a warning, or the config's `noChanges.else` effect (fail, or a human decides).
 */
export function noChangesFlag(i: Pick<FlagInput, 'noChanges' | 'ticketType' | 'noCodeReason'>): EvidenceFlag {
  const allowed = i.noChanges.allow.includes(i.ticketType);
  if (allowed || i.noCodeReason)
    return {
      kind: 'no-changes',
      level: 'info',
      message: `no files changed${i.noCodeReason ? `: ${i.noCodeReason}` : ` (allowed for ${i.ticketType} tickets)`}`,
    };
  const effect = i.noChanges.else === 'flag' ? undefined : i.noChanges.else;
  return {
    kind: 'no-changes',
    level: effect ? 'alert' : 'warn',
    message: `no files changed since the claim${effect ? NO_CHANGES_EFFECT[effect] : ''}`,
    ...(effect ? { effect } : {}),
  };
}
