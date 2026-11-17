/** A command as words: split on spaces, never handed to a shell. */
export const commandWords = (command: string) => command.trim().split(/\s+/).filter(Boolean);
