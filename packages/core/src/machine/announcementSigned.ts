import { machineId } from './machineId';
import { machineSigned } from './machineKey';

/** Whether `sig` is this machine's signature of the announcement (announcementSig.ts); never throws. */
export function announcementSigned(root: string, what: string, fields: (string | number | boolean)[], sig: unknown) {
  try {
    return machineSigned([what, machineId(root), ...fields.map(String)], sig);
  } catch {
    return false;
  }
}
