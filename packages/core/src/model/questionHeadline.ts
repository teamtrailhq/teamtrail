import { oneLine, plainBreaks } from './safeText';

/** At most this many characters in the `summary` an agent gives with its question (ask_human refuses more). */
export const QUESTION_SUMMARY_MAX = 120;
/** At most this many characters in a headline: a one-sentence question of a line or two reads whole. */
const HEADLINE_MAX = 160;

/** A question's headline, and whether it says the whole question (then the question needs no body under it). */
export interface QuestionHeadline {
  text: string;
  whole: boolean;
}

/** A line that starts a list or an option ("- a", "1. a", "A) a"): the first paragraph ends before it. */
const ITEM = /^(?:[-*+]|\d{1,3}[.)]|[A-Za-z]\))\s/;
const FENCE = /^(`{3,}|~{3,})/;
/** A sentence ends at . ! or ? before a space and a capital or a digit (so "e.g. this" and "v2.1" read on). */
const SENTENCE_END = /^(.+?[.!?])\s+(?=[A-Z0-9])/;

/** Inline markdown as its words: emphasis and code marks dropped, a link as its text, a heading or quote mark off. */
const plain = (line: string) =>
  line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .trim();

/** The question's first paragraph, as one line: up to a blank line, a list or option, or a code block. */
function firstParagraph(text: string): string {
  const lines = plainBreaks(text)
    .split('\n')
    .map((l) => l.trim());
  const start = lines.findIndex((l) => l && !FENCE.test(l));
  if (start < 0) return '';
  const words: string[] = [];
  for (const line of lines.slice(start)) {
    const said = plain(line);
    if (!line || FENCE.test(line) || (words.length && ITEM.test(said))) break;
    words.push(said);
  }
  return oneLine(words.join(' '));
}

/** Cut at `max` characters on a word, with an ellipsis. */
function cut(line: string, max: number): string {
  if (line.length <= max) return line;
  const head = line.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max / 2 ? head.slice(0, space) : head).trimEnd()}…`;
}

/**
 * What a question says in one line, for every place that shows it as a title (the bubble, Needs you, the trail
 * bar, the inspector, Slack): the agent's own `summary` when it gave one, else the question's first sentence, cut
 * cleanly at `max`. Teamtrail never writes a summary itself: it never calls a model.
 */
export function questionHeadline(q: { text: string; summary?: string }, max = HEADLINE_MAX): QuestionHeadline {
  const full = oneLine(q.text);
  const summary = q.summary && oneLine(q.summary);
  if (summary) return { text: cut(summary, max), whole: summary === full && summary.length <= max };
  const para = firstParagraph(q.text);
  const sentence = para.match(SENTENCE_END)?.[1] ?? para;
  const text = cut(sentence || full, max);
  return { text, whole: text === full };
}
