/** Family names as people say them. */
const FAMILIES: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  fable: 'Fable',
  codex: 'Codex',
  mini: 'mini',
  nano: 'nano',
};

const isDate = (part: string) => /^\d{8}$/.test(part) || part === 'latest';
const isVersion = (part: string) => /^\d{1,2}$/.test(part);

/** Claude ids: `claude-sonnet-4-5-20250929` → "Sonnet 4.5", `claude-3-5-haiku-latest` → "Haiku 3.5". */
function claude(parts: string[]) {
  const family = parts.find((p) => FAMILIES[p]);
  if (!family) return undefined;
  const version = parts.filter(isVersion).join('.');
  return version ? `${FAMILIES[family]} ${version}` : FAMILIES[family];
}

/** GPT ids: `gpt-5-codex` → "GPT-5 Codex", `gpt-4.1-mini` → "GPT-4.1 mini". */
function gpt(parts: string[]) {
  const [, version, ...rest] = parts;
  const words = rest.filter((p) => !isDate(p)).map((p) => FAMILIES[p] ?? p);
  return [`GPT-${version ?? ''}`, ...words].join(' ').trim();
}

/**
 * The model an agent runs on, short enough for a map card: "Sonnet 4.5", "Opus 4.1", "GPT-5 Codex". An id it doesn't
 * know stays as it is, less a trailing date.
 */
export function shortModel(model?: string): string | undefined {
  const id = model?.trim();
  if (!id) return undefined;
  const parts = id.toLowerCase().split(/[-_/]/).filter(Boolean);
  if (parts.includes('claude')) return claude(parts) ?? id;
  if (parts[0] === 'gpt') return gpt(parts);
  return id.replace(/[-_](\d{8}|latest)$/, '');
}
