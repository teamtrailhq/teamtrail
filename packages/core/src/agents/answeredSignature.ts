import { machineId } from '../machine/machineId';
import { machineSign, machineSigned } from '../machine/machineKey';
import type { AnsweredQuestion } from '../model/types';

/*
 * A session doc's `answered` list says which questions the human answered, on what and how. The doc is a file the
 * agent could write too, so where an entry stands for the human having a say (the risky-files flag,
 * attention/answeredTickets.ts), only an entry signed by the process that delivered a verified answer counts.
 */
const fields = (root: string, a: AnsweredQuestion) => [
  'answered',
  machineId(root),
  a.sessionId,
  a.id,
  a.mapId,
  a.ticketId ?? '',
  a.category ?? '',
  a.urgency ?? '',
  a.via ?? '',
  // only on entries that have them, so a record signed before categories were kept still verifies
  ...(a.categories?.length ? [a.categories.join(',')] : []),
];

/** The entry with this machine's signature; as it was when the key can't be read (it then counts for nothing). */
export function signAnswered(root: string, a: AnsweredQuestion): AnsweredQuestion {
  try {
    return { ...a, sig: machineSign(fields(root, a)) };
  } catch {
    return a;
  }
}

/** Whether Teamtrail signed this entry on this machine, as it reads now. False when the key can't be read. */
export function answeredSigned(root: string, a: AnsweredQuestion): boolean {
  try {
    return machineSigned(fields(root, a), a.sig);
  } catch {
    return false;
  }
}
