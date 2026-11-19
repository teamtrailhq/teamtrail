const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, '$2');
const indentOf = (line: string) => line.length - line.trimStart().length;

/** The lines of a block under a key at `column`: everything indented deeper, `- ` list markers dropped. */
function blockAfter(lines: string[], at: number, column: number): string[] {
  const out: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (indentOf(line) <= column) break;
    out.push(line.trim().replace(/^-\s+/, ''));
  }
  return out;
}

/**
 * The shell lines a CI file runs: GitHub Actions `run:` (one line or a `|` block) and GitLab `script:` lists.
 * Comments and blank lines left out; read as text, never parsed as YAML.
 */
export function ciCommandLines(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    const m = /^(\s*(?:-\s+)?)(run|script|before_script):\s*(.*?)\s*$/.exec(line);
    if (!m) return;
    const value = m[3];
    const block = !value || /^[|>][-+]?$/.test(value);
    const found = block ? blockAfter(lines, i, m[1].length) : [unquote(value)];
    out.push(...found.filter((l) => l && !l.startsWith('#')));
  });
  return out;
}
