/** Whether the gate controls can be used here, and why not. */
export type GateLock = { kind: 'open' } | { kind: 'locked'; reason?: string };

/**
 * Gates are set on the machine Teamtrail runs on (the route refuses other devices), over a verification.json that is
 * there, valid and approved here: setting one approves the file, which must never approve commands nobody saw.
 * Unknown `local` (still asking, or no server) locks without a reason, so nothing flashes.
 */
export function gateLock(o: { local?: boolean; exists: boolean; valid: boolean; waiting?: boolean }): GateLock {
  if (o.local === false) return { kind: 'locked', reason: 'Set on the machine Teamtrail runs on.' };
  if (!o.exists) return { kind: 'locked', reason: 'Set the checks first: without them nothing is verified.' };
  if (!o.valid) return { kind: 'locked', reason: 'Fix verification.json first.' };
  if (o.waiting) return { kind: 'locked', reason: 'Approve the checks first.' };
  if (o.local === undefined) return { kind: 'locked' };
  return { kind: 'open' };
}
