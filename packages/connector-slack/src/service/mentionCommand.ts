/** What @Scout and a DM to Scout understand. */
export type MentionCommand = { sub: 'inbox' | 'status' | 'help' | ''; arg: string };

const KNOWN = new Set(['inbox', 'status', 'help']);

/** Words that sit between "status" and the trail's name in a sentence: "status of the Slack live test". */
const FILLER = new Set(['of', 'for', 'on', 'the', 'a', 'trail', 'please', 'pls']);

/** A word as it is matched: lowercase, without the punctuation around or inside it ("What's" → "whats"). */
const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The name after "status": its words as typed, without filler words at either end or trailing punctuation. */
function trailName(words: string[]) {
  const kept = words.map((w) => w.replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  while (kept.length && FILLER.has(bare(kept[0]))) kept.shift();
  while (kept.length && FILLER.has(bare(kept[kept.length - 1]))) kept.pop();
  return kept.join(' ');
}

/**
 * The command in what someone wrote to Scout, without a model: the first known word anywhere in the text, case and
 * punctuation ignored ("whats in the inbox?", "HELP!"). For status, the words after it name the trail. Text with no
 * known word is `''`, which gets the help.
 */
export function mentionCommand(text: unknown): MentionCommand {
  const words = String(text ?? '')
    .replace(/<[@!][^>\s]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const at = words.findIndex((w) => KNOWN.has(bare(w)));
  if (at < 0) return { sub: '', arg: '' };
  const sub = bare(words[at]) as MentionCommand['sub'];
  return { sub, arg: sub === 'status' ? trailName(words.slice(at + 1)) : '' };
}
