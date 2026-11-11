import { contentHash } from '../trust/trustLedger';

export type ShownCheck = { ok: true } | { ok: false; status: 400 | 409; error: string };

/**
 * The one check every single-item approval route makes (accept a brief or a criteria proposal, confirm criteria or
 * knowledge): the request carries the hash of the content the page showed, `sha256:` of exactly the text this
 * machine records as approved (trust/trustLedger.ts `contentHash`), and it must still be the content on disk.
 * Missing: 400. Changed since, or gone: 409, and nothing is approved. `current` is the exact text the approval
 * would cover; `what` names it in the message ("The brief").
 */
export function checkShown(shown: unknown, current: string | undefined, what: string): ShownCheck {
  if (typeof shown !== 'string' || !shown)
    return { ok: false, status: 400, error: '"hash" of what you were shown is required: reload and review it' };
  if (current === undefined) return { ok: false, status: 409, error: `${what} is gone: nothing was approved.` };
  if (contentHash(current) !== shown)
    return {
      ok: false,
      status: 409,
      error: `${what} changed since you opened it: review it again before you approve it.`,
    };
  return { ok: true };
}
