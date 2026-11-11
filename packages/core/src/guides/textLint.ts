import type { GuideFinding } from '../model/guide';
import { TEXT_RULES, type TextRule } from './injectionRules';

/** A normalised text and, for each of its characters, the 1-based line of the file it came from. */
interface Normalised {
  text: string;
  lineOf: number[];
}

/**
 * Letters from other scripts that look like Latin ones (Cyrillic, Greek), folded to the Latin letter so "іgnore" or
 * "vеrification.json" reads as written. Small on purpose: the lint is advice, the person still reads the guide.
 */
const LOOKALIKES: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  ɡ: 'g',
  ı: 'i',
  α: 'a',
  β: 'b',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ζ: 'z',
  η: 'n',
};
const fold = (s: string) => [...s].map((c) => LOOKALIKES[c] ?? c).join('');

/** Taken out of the squashed form: spaces, quotes, backticks and the marks people split a word with. */
const SQUASH = /[\s`'"*+_|]/;

/**
 * The whole file as one string: compatibility-folded (full-width and styled letters become plain), lower case,
 * lines joined and runs of whitespace collapsed to one space. `squash` also drops what SQUASH names.
 */
function normalise(lines: string[], squash: boolean): Normalised {
  const out: string[] = [];
  const lineOf: number[] = [];
  const push = (s: string, line: number) => {
    for (const c of s) {
      out.push(c);
      lineOf.push(line);
    }
  };
  lines.forEach((raw, i) => {
    for (const ch of `${raw}\n`) {
      const c = fold(ch.normalize('NFKC').toLowerCase());
      if (squash && SQUASH.test(c)) continue;
      if (/\s/.test(c)) {
        if (out.at(-1) !== ' ') push(' ', i + 1);
        continue;
      }
      push(c, i + 1);
    }
  });
  return { text: out.join(''), lineOf };
}

const globalOf = (re: RegExp) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

function wholeTextFindings(form: Normalised, rules: TextRule[]): GuideFinding[] {
  const out: GuideFinding[] = [];
  for (const r of rules)
    for (const m of form.text.matchAll(globalOf(r.re))) {
      const at = m.index + (m[0].length - m[0].trimStart().length);
      out.push({ line: form.lineOf[at] ?? 1, rule: r.rule, level: r.level, message: r.message });
    }
  return out;
}

function lineFindings(lines: string[]): GuideFinding[] {
  const out: GuideFinding[] = [];
  lines.forEach((line, i) => {
    for (const r of TEXT_RULES) {
      if (r.rule === 'link' && /^homepage\s*:/.test(line)) continue;
      if (r.re.test(line)) out.push({ line: i + 1, rule: r.rule, level: r.level, message: r.message });
    }
  });
  return out;
}

/**
 * The text rules over a guide file: each line as written, then the whole text normalised (a sentence split over two
 * lines, full-width letters, odd spacing), then squashed for the rules that name files. One finding per rule and line.
 */
export function lintText(text: string): GuideFinding[] {
  const lines = text.split(/\r?\n/);
  const whole = TEXT_RULES.filter((r) => !r.perLine);
  const all = [
    ...lineFindings(lines),
    ...wholeTextFindings(normalise(lines, false), whole),
    ...wholeTextFindings(
      normalise(lines, true),
      whole.filter((r) => r.squashed),
    ),
  ];
  const seen = new Set<string>();
  return all.filter((f) => {
    const key = `${f.line}:${f.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
