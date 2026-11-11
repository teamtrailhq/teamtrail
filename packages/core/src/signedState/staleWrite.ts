/**
 * A write refused because a gate field it changes changed since the writer read the file: writing it would undo a
 * change the writer never saw. `stale` lets the Lookout reload, and the file route answer 409.
 */
export function staleWrite(rel: string, fields: string[]) {
  const msg = `${rel} changed while this was being done (${fields.join(', ')}): nothing was written. Read it again and redo the change.`;
  return Object.assign(new Error(msg), { stale: true, status: 409 });
}
