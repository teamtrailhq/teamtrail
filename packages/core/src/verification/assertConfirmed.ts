import type { Ticket } from '../model/types';
import { OperationError } from '../planning/operations/operationError';
import type { LevelInfo } from './policy';

/**
 * Settings someone else wrote into the tracker that nobody here confirmed: the work waits for the human to set
 * them, so no one's settings decide unchecked what a completion has to prove.
 */
export function assertConfirmed(t: Pick<Ticket, 'key'>, info: Pick<LevelInfo, 'unconfirmed'>) {
  if (!info.unconfirmed) return;
  throw new OperationError(
    `${t.key} can't be completed yet: its verification settings came from the tracker and the human hasn't confirmed them here. Tell the human; they set them in the Lookout (it's in their queue).`,
  );
}
