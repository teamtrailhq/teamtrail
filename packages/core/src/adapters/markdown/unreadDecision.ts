/**
 * A decision file that can't be listed: one nobody signed on this machine reads as missing (signedState/), and isn't
 * a decision; any other failure (permissions, a broken file) is said, never dropped in silence.
 */
export function unreadDecision(file: string, e: { code?: string; message?: string }): undefined {
  if (e.code !== 'ENOENT') console.warn(`Teamtrail: decision ${file} can't be read: ${e.message}`);
  return undefined;
}
