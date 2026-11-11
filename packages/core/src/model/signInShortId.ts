/**
 * A paired browser's id as the terminal and Settings show it side by side (`si_3fa9c1`): enough to tell which entry
 * a sign-in line means, so one the human didn't make can be found and revoked.
 */
export const signInShortId = (id: string) => id.slice(0, 9);
