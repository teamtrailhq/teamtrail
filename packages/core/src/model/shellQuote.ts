/**
 * One value as one word of a POSIX shell command line: left alone when it is plainly safe, else in single
 * quotes, where nothing is special (`$(…)`, backticks, `;`, `|`, spaces), with `'` itself written `'\''`.
 * For every command Teamtrail prints for someone to copy or writes into a config that a shell runs. On
 * Windows the same text is right for Git Bash and WSL; cmd.exe and PowerShell quote differently, so values
 * that need quoting are worth checking there before running.
 */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Words joined into a command line, each quoted as needed. */
export const shellLine = (words: string[]) => words.map(shellQuote).join(' ');
