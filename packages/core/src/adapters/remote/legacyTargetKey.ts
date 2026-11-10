/**
 * The key a queue or an accepted-settings record had before keys carried a hash of the raw target (outboxKey):
 * the readable part alone. Used once, to move files written under it to the new key.
 */
export const legacyTargetKey = (key: string) => key.replace(/-[0-9a-f]{16}$/, '');
