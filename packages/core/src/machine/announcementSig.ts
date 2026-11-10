import { machineId } from './machineId';
import { machineSign } from './machineKey';

/**
 * Signs or checks what a Teamtrail process announces in the repo's local folder (an MCP endpoint, the Lookout's
 * lock) with this machine's key, bound to the project (`root`) and to what is announced (`what`, `fields`). Any
 * local process can write those files; only Teamtrail on this machine (with the user's config folder) can sign them.
 * A key that can't be read signs nothing and believes nothing: the announcement is then simply ignored.
 */
export function announcementSig(root: string, what: string, fields: (string | number | boolean)[]) {
  try {
    return machineSign([what, machineId(root), ...fields.map(String)]);
  } catch {
    return undefined;
  }
}
