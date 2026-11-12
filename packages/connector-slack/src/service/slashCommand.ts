import { mentionCommand } from './mentionCommand';

/** `/scout` subcommands, typed as the first word. */
const SUBCOMMANDS = new Set(['decide', 'status', 'inbox', 'ticket', 'decisions', 'who', 'help']);

/**
 * What `/scout <text>` asks. A subcommand as the first word is taken as typed (`/scout decide Postgres`). Anything
 * else is read the way @Scout reads a message (`mentionCommand`): `/scout what's blocking #12?`, `/scout #12`,
 * `/scout who's working`. `sub` is `''` for empty text (help), and the first word when nothing is understood.
 */
export function slashCommand(text: unknown): { sub: string; arg: string; unknown?: true } {
  const [first = '', ...rest] = String(text ?? '')
    .trim()
    .split(/\s+/);
  const sub = first.toLowerCase();
  if (!sub || SUBCOMMANDS.has(sub)) return { sub, arg: rest.join(' ').trim() };
  const read = mentionCommand(text);
  return read.sub ? read : { sub: first, arg: '', unknown: true };
}
