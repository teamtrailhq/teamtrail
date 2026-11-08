import { splitList, unquote } from '../model/frontmatter';

/** A value of the YAML subset role files use: a scalar, a list of scalars, or a map. */
export type YamlNode = string | string[] | { [key: string]: YamlNode };
export type YamlMap = { [key: string]: YamlNode };

interface Line {
  n: number;
  indent: number;
  text: string;
}

export interface YamlParse {
  value: YamlMap;
  errors: { line: number; message: string }[];
  /** The line of every key, by dotted path (`proposedChecks.lint.run`). */
  lines: Record<string, number>;
}

/**
 * Parses the small YAML subset of role frontmatter: `key: scalar`, `key: [a, b]`, and indented blocks of
 * `- item` lines or nested keys. Anything else (flow maps, block scalars, anchors) is reported, never guessed.
 * `firstLine` is the file line of the first source line, so errors name the line in the file.
 */
export function parseYamlSubset(src: string, firstLine = 1): YamlParse {
  const lines: Line[] = src
    .split('\n')
    .map((raw, i) => ({ n: i + firstLine, indent: raw.length - raw.trimStart().length, text: raw.trim() }))
    .filter((l) => l.text && !l.text.startsWith('#'));
  const state = { lines, i: 0, errors: [] as YamlParse['errors'], at: {} as Record<string, number> };
  const value = lines.length ? readMap(state, { indent: lines[0].indent, path: '' }) : {};
  return { value, errors: state.errors, lines: state.at };
}

type State = { lines: Line[]; i: number; errors: YamlParse['errors']; at: Record<string, number> };
type Scope = { indent: number; path: string };

function readMap(s: State, scope: Scope): YamlMap {
  const out: YamlMap = {};
  while (s.i < s.lines.length && s.lines[s.i].indent >= scope.indent) {
    const l = s.lines[s.i++];
    if (l.indent > scope.indent) {
      s.errors.push({ line: l.n, message: 'unexpected indentation' });
      continue;
    }
    const colon = l.text.indexOf(':');
    if (colon <= 0 || l.text.startsWith('-')) {
      s.errors.push({ line: l.n, message: 'expected "key: value"' });
      continue;
    }
    const key = l.text.slice(0, colon).trim();
    const path = scope.path ? `${scope.path}.${key}` : key;
    if (key in out) s.errors.push({ line: l.n, message: `"${key}" appears twice` });
    s.at[path] = l.n;
    out[key] = readValue(s, { line: l, rest: l.text.slice(colon + 1).trim(), path });
  }
  return out;
}

function readValue(s: State, at: { line: Line; rest: string; path: string }): YamlNode {
  if (at.rest) return scalarOrList(s, at.rest, at.line.n);
  const next = s.lines[s.i];
  if (!next) return '';
  // `key:` followed by `- item` lines, indented or not
  if (next.text.startsWith('-') && next.indent >= at.line.indent) return readList(s, next.indent);
  if (next.indent <= at.line.indent) return '';
  return readMap(s, { indent: next.indent, path: at.path });
}

function readList(s: State, indent: number): string[] {
  const out: string[] = [];
  while (s.i < s.lines.length && s.lines[s.i].indent === indent && s.lines[s.i].text.startsWith('-')) {
    const l = s.lines[s.i++];
    const item = scalarOrList(s, l.text.slice(1).trim(), l.n);
    if (typeof item === 'string') out.push(item);
    else s.errors.push({ line: l.n, message: 'list items must be plain text' });
  }
  return out;
}

function scalarOrList(s: State, v: string, line: number): YamlNode {
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) s.errors.push({ line, message: 'an inline list must end with "]" on the same line' });
    return splitList(v.slice(1, v.endsWith(']') ? -1 : undefined)).map(unquote);
  }
  if (v.startsWith('{')) s.errors.push({ line, message: 'inline maps are not supported: use indented keys' });
  if (/^[|>&*!]/.test(v)) s.errors.push({ line, message: 'block scalars, anchors and tags are not supported' });
  return unquote(v);
}
