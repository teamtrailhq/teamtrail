/** What @Scout and a DM to Scout understand. */
export type MentionCommand = { sub: 'inbox' | 'status' | 'ticket' | 'decisions' | 'who' | 'help' | ''; arg: string };

/** The words Scout reads, as matched (`bare`), and the command each one asks for. */
const KNOWN = new Map<string, MentionCommand['sub']>([
  ['inbox', 'inbox'],
  ['status', 'status'],
  ['ticket', 'ticket'],
  ['blocking', 'ticket'],
  ['blocked', 'ticket'],
  ['decisions', 'decisions'],
  ['decision', 'decisions'],
  ['decided', 'decisions'],
  ['decide', 'decisions'],
  ['who', 'who'],
  ['whos', 'who'],
  ['help', 'help'],
]);

/** Words that sit between the command and its subject in a sentence: "status of the Slack live test". */
const FILLER = new Set([
  'of',
  'for',
  'on',
  'the',
  'a',
  'an',
  'trail',
  'ticket',
  'please',
  'pls',
  'about',
  'did',
  'we',
  'is',
  'are',
  'in',
]);

/** A ticket's key as people type it: `#12`, `WAY-12`. */
const TICKET_KEY = /^(#\d+|[A-Za-z][A-Za-z0-9]*-\d+)$/;

/** A word as it is matched: lowercase, without the punctuation around or inside it ("What's" → "whats"). */
const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** A word without the punctuation around it, `#` at the start kept ("#12?" → "#12"). */
const trimmed = (w: string) => w.replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}]+$/gu, '');

/** The subject after the command: its words as typed, without filler words at either end or trailing punctuation. */
function subject(words: string[]) {
  const kept = words.map(trimmed).filter(Boolean);
  while (kept.length && FILLER.has(bare(kept[0]))) kept.shift();
  while (kept.length && FILLER.has(bare(kept[kept.length - 1]))) kept.pop();
  return kept.join(' ');
}

/** A ticket: the first word anywhere that is a ticket key, else the words after the command (a title). */
function ticketArg(words: string[], after: string[]) {
  return words.map(trimmed).find((w) => TICKET_KEY.test(w)) ?? subject(after);
}

/**
 * The command in what someone wrote to Scout, without a model: the first known word anywhere in the text, case and
 * punctuation ignored ("whats in the inbox?", "HELP!", "what's blocking #12?"). For status the words after it name
 * the trail, for decisions a trail or the words to look for, for ticket a key anywhere in the text (none: what's
 * blocked). A ticket key with no known word asks about that ticket; "who" counts only when neither is there.
 * Anything else is `''`, which gets the help.
 */
export function mentionCommand(text: unknown): MentionCommand {
  const words = String(text ?? '')
    .replace(/<[@!#][^>\s]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // "who" only asks who's working when nothing else does: "who decided the DB?", "who is on #3?" ask about those.
  const at = words.findIndex((w) => KNOWN.has(bare(w)) && KNOWN.get(bare(w)) !== 'who');
  if (at < 0) {
    const key = words.map(trimmed).find((w) => TICKET_KEY.test(w));
    if (key) return { sub: 'ticket', arg: key };
    return words.some((w) => KNOWN.get(bare(w)) === 'who') ? { sub: 'who', arg: '' } : { sub: '', arg: '' };
  }
  const sub = KNOWN.get(bare(words[at]))!;
  const after = words.slice(at + 1);
  if (sub === 'status' || sub === 'decisions') return { sub, arg: subject(after) };
  if (sub === 'ticket') return { sub, arg: ticketArg(words, after) };
  return { sub, arg: '' };
}
