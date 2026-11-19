const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * The variable names a CI file sets under `env:` (GitHub Actions) or `variables:` (GitLab), and whether each comes
 * from the CI's secrets (`${{ secrets.X }}`). Names only: values are never kept.
 */
export function ciEnvNames(text: string): { name: string; secret: boolean }[] {
  const lines = text.split('\n');
  const out: { name: string; secret: boolean }[] = [];
  lines.forEach((line, i) => {
    if (!/^\s*(env|variables):\s*$/.test(line)) return;
    const column = indentOf(line);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim()) continue;
      if (indentOf(next) <= column) break;
      const m = /^\s+([A-Z][A-Z0-9_]*):\s*(.*)$/.exec(next);
      if (m) out.push({ name: m[1], secret: /secrets\./.test(m[2]) });
    }
  });
  return out;
}
