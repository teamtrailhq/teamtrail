import type { MdBlock } from './types';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(\s+|$)/;
/** Deeper than this, nested lists and quotes read as paragraphs: no input recurses without end. */
const MAX_DEPTH = 6;

interface Read {
  block: MdBlock;
  next: number;
}

interface Marker {
  ordered: boolean;
  start: number;
  indent: number;
  /** The column the item's content starts at: its continuation lines are indented to it. */
  content: number;
  rest: string;
}

/**
 * Markdown as agents write it in tickets and comments, as blocks: paragraphs, headings, lists (nested by indent),
 * fenced code, quotes and rules. Inline markdown stays text here (parseInline reads it). Line-based and linear;
 * anything it doesn't know is a paragraph, so nothing is ever lost or run.
 */
export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseLines(lines, 0);
}

function parseLines(lines: string[], depth: number): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const read = readBlock(lines, i, depth);
    blocks.push(read.block);
    i = read.next;
  }
  return blocks;
}

function readBlock(lines: string[], i: number, depth: number): Read {
  const line = lines[i];
  if (FENCE.test(line)) return readFence(lines, i);
  const heading = line.match(HEADING);
  if (heading) return { block: { kind: 'heading', level: heading[1].length, text: heading[2] ?? '' }, next: i + 1 };
  if (RULE.test(line)) return { block: { kind: 'rule' }, next: i + 1 };
  const nests = depth < MAX_DEPTH;
  if (nests && QUOTE.test(line)) return readQuote(lines, i, depth);
  const m = nests ? marker(line) : undefined;
  if (m) return readList({ lines, i, depth, first: m });
  return readParagraph(lines, i);
}

function readFence(lines: string[], i: number): Read {
  const open = lines[i].match(FENCE)![1];
  const closes = (l: string) => {
    const t = l.trim();
    return /^(`{3,}|~{3,})$/.test(t) && t[0] === open[0] && t.length >= open.length && indentOf(l) < 4;
  };
  const body: string[] = [];
  let j = i + 1;
  while (j < lines.length && !closes(lines[j])) body.push(lines[j++]);
  return { block: { kind: 'code', text: body.join('\n') }, next: j + 1 };
}

function readQuote(lines: string[], i: number, depth: number): Read {
  const body: string[] = [];
  let j = i;
  while (j < lines.length && QUOTE.test(lines[j])) body.push(lines[j++].replace(QUOTE, ''));
  return { block: { kind: 'quote', blocks: parseLines(body, depth + 1) }, next: j };
}

function readParagraph(lines: string[], i: number): Read {
  const body = [lines[i].trim()];
  let j = i + 1;
  while (j < lines.length && lines[j].trim() && !startsBlock(lines[j])) body.push(lines[j++].trim());
  return { block: { kind: 'paragraph', text: body.join('\n') }, next: j };
}

function readList(p: { lines: string[]; i: number; depth: number; first: Marker }): Read {
  const { lines, first } = p;
  const items: MdBlock[][] = [];
  let j = p.i;
  while (j < lines.length) {
    // blank lines between items keep the list going
    const k = lines[j].trim() ? j : nextFilled(lines, j);
    const m = k < 0 ? undefined : marker(lines[k]);
    if (!m || m.ordered !== first.ordered || m.indent > first.indent + 1) break;
    const item = readItem(lines, k, m);
    items.push(parseLines(item.lines, p.depth + 1));
    j = item.next;
  }
  return { block: { kind: 'list', ordered: first.ordered, start: first.start, items }, next: j };
}

/** One list item's lines, its marker taken off and its indent removed: its own blocks, nested lists among them. */
function readItem(lines: string[], i: number, m: Marker) {
  const body = [m.rest];
  let j = i + 1;
  while (j < lines.length) {
    const line = lines[j];
    const into = (l: string) => indentOf(l) >= m.content || (indentOf(l) > m.indent && !!marker(l));
    if (!line.trim()) {
      const k = nextFilled(lines, j);
      if (k < 0 || !into(lines[k])) break;
      body.push('');
    } else if (into(line)) {
      body.push(line.slice(Math.min(indentOf(line), m.content)));
    } else if (startsBlock(line)) {
      break;
    } else {
      // a lazy continuation of the item's paragraph
      body.push(line.trim());
    }
    j++;
  }
  return { lines: body, next: j };
}

function marker(line: string): Marker | undefined {
  const m = line.match(ITEM);
  if (!m || RULE.test(line)) return undefined;
  const ordered = /\d/.test(m[2]);
  return {
    ordered,
    start: ordered ? parseInt(m[2], 10) : 1,
    indent: m[1].length,
    content: m[0].length,
    rest: line.slice(m[0].length),
  };
}

const startsBlock = (l: string) => FENCE.test(l) || HEADING.test(l) || RULE.test(l) || QUOTE.test(l) || !!marker(l);

const indentOf = (l: string) => l.length - l.trimStart().length;

function nextFilled(lines: string[], from: number) {
  for (let k = from; k < lines.length; k++) if (lines[k].trim()) return k;
  return -1;
}
