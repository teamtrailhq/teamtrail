import { parseDecision } from '../planning/decisions/decisionFile';
import { lineDiff } from '../trust/lineDiff';
import type { OutsideChange } from './outsideChanges';
import { decisionWords, type FieldValue, type Fields } from './stateFields';

/*
 * What an outside change says, line by line, for Settings → Approvals and `teamtrail approve`: each gate field
 * old → new, a decision's words as they were and as they are, a trail's files nobody signed with what they claim.
 */

const show = (v: FieldValue | undefined) => {
  if (v === null || v === undefined || v === '') return '(none)';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
  return String(v);
};

const UNREADABLE =
  'Its trail’s signed record can’t be read, so this may be something Teamtrail wrote: accept it, or remove the file yourself.';

type Words = Record<string, string>;

const wordsOf = (text: string | undefined): Words | undefined => {
  try {
    return text ? decisionWords(parseDecision(text)) : undefined;
  } catch {
    return undefined;
  }
};

/** A decision nobody signed: who it says decided, and its question, answer and summary in full. */
function addedDecision(c: OutsideChange): string[] {
  const w = wordsOf(c.text);
  return [
    `decided_by: ${show(c.file?.decided_by)}`,
    `source: ${show(c.file?.source)}`,
    `question: ${w?.question ?? ''}`,
    `answer: ${w?.answer ?? ''}`,
    `summary: ${w?.summary ?? ''}`,
    ...(c.unreadable ? [UNREADABLE] : []),
  ];
}

/** A decision reworded: each of its words that changed, as signed (`- `) and as the file has it now (`+ `). */
function reworded(c: OutsideChange): string[] {
  const was = wordsOf(c.signedText);
  const now = wordsOf(c.text);
  if (!was || !now) return ['the question, the answer, the rationale or the human’s words were edited'];
  return Object.keys(now)
    .filter((k) => was[k] !== now[k])
    .flatMap((k) => [`${k}:`, ...lineDiff(was[k], now[k])]);
}

function trailGone(c: OutsideChange): string[] {
  const { tickets, decisions } = c.trail!;
  return [
    `${c.mapId}/map.md is gone: ${tickets} tickets and ${decisions} decisions signed here are no longer in the tracker folder`,
    'Renamed? The new folder shows as a trail added outside Teamtrail. Accept to forget the old one; restore it from git otherwise.',
  ];
}

/** The lines of one outside change. */
export function changeLines(c: OutsideChange): string[] {
  if (c.trail) return trailGone(c);
  if (c.fields.includes('oversized')) return [`${c.rel} is larger than 1 MB, so Teamtrail doesn't read it`];
  if (c.fields.includes('removed')) return [`${c.rel} was deleted`];
  if (c.kind === 'decision' && !c.signed) return addedDecision(c);
  return c.fields.flatMap((k) =>
    k === 'words' ? reworded(c) : [`${k}: ${show(c.counts?.[k])} → ${show(c.file?.[k])}`],
  );
}

const claims = (f: Fields | undefined) =>
  Object.entries(f ?? {})
    .filter(([, v]) => v !== null && v !== false && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k} ${show(v)}`)
    .join(' · ');

/** The files of a trail nobody signed here, each with the gate fields it claims. */
export function addedLines(changes: OutsideChange[]): string[] {
  const lines = changes.map((c) => {
    const name = c.kind === 'map' ? 'map.md' : `#${c.id}`;
    if (c.fields.includes('oversized')) return `${name}: larger than 1 MB, not read`;
    return `${name}: ${claims(c.file)}`;
  });
  return changes.some((c) => c.unreadable) ? [...lines, UNREADABLE] : lines;
}
