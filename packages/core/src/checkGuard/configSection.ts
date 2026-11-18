/**
 * The lines of an ini or toml file under headers that match `header`, up to the next header that doesn't: the part
 * of pyproject.toml or setup.cfg one tool reads. Undefined for a missing file.
 */
export function configSection(text: string | null | undefined, header: RegExp): string | undefined {
  if (text == null) return undefined;
  const out: string[] = [];
  let inside = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) inside = header.test(trimmed);
    if (inside) out.push(trimmed);
  }
  return out.join('\n');
}
