/** A TOML value as the profile needs it: strings, string lists, and everything else as its raw text. */
export type TomlValue = string | string[];

/** A line without its comment: a `#` outside quotes ends it. */
function uncommented(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote && line[i - 1] !== '\\') quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

/** A value's text as a string, a list of the strings in it, or the raw text (numbers, booleans, inline tables). */
function valueOf(raw: string): TomlValue {
  const text = raw.trim();
  if (text.startsWith('[')) return [...text.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
  return unquote(text);
}

const depth = (s: string) => (s.match(/\[/g)?.length ?? 0) - (s.match(/\]/g)?.length ?? 0);

/**
 * A small TOML reader for manifests (pyproject.toml, Cargo.toml, rust-toolchain.toml, mise.toml): tables by name
 * (`[tool.poetry]`, `[[bin]]` as `bin`), each with its keys, quoted and dotted keys as written. Multi-line arrays are
 * joined; multi-line strings and inline tables are kept as raw text. Never throws: what it can't read is left out.
 */
export function tomlTables(text: string): Map<string, Map<string, TomlValue>> {
  const tables = new Map<string, Map<string, TomlValue>>([['', new Map()]]);
  let current = tables.get('')!;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = uncommented(lines[i]).trim();
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (header) {
      const name = header[1].split('.').map(unquote).join('.');
      current = tables.get(name) ?? new Map();
      tables.set(name, current);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let value = line.slice(eq + 1);
    while (value.trim().startsWith('[') && depth(value) > 0 && i + 1 < lines.length) value += uncommented(lines[++i]);
    const key = line.slice(0, eq).trim().split('.').map(unquote).join('.');
    current.set(key, valueOf(value));
  }
  return tables;
}
