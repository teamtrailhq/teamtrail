import { OperationError } from '../planning/operations/operationError';
import { verifyAgain } from './verifyAgain';
import type { VerifyEnv } from './verifyCompletion';

/** What confirming a ticket's criteria set off: its last completion checked again, or why it wasn't. */
export type AgainOnConfirm = { attemptId: string } | { skipped: string };

/**
 * Once the trail lead confirms a ticket's criteria, a completion that passed everything but them is checked again
 * on the same commit by itself (verifyAgain.ts): confirming is the human's part, the regrade is the machine's.
 * Nothing happens when there is no such completion; why is returned, never thrown, since the confirmation stands.
 */
export async function checkAgainOnConfirm(
  env: VerifyEnv,
  r: { mapId: string; ticketId: string; by: string },
): Promise<AgainOnConfirm> {
  try {
    const run = await verifyAgain(env, r);
    void run.done.catch(() => {});
    return { attemptId: run.attemptId };
  } catch (e) {
    if (e instanceof OperationError) return { skipped: e.message };
    throw e;
  }
}
