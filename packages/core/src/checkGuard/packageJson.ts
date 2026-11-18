/** A package.json as the guard reads it: its scripts, and its other keys as JSON text to compare. */
export interface PackageView {
  scripts: Record<string, string>;
  keys: Record<string, string>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A package.json's text read for the guard: undefined when missing or unread; not JSON reads as `invalid`. */
export function packageJson(text: string | null | undefined): PackageView | 'invalid' | undefined {
  if (text == null) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'invalid';
  }
  if (!isObj(raw)) return 'invalid';
  const scripts: Record<string, string> = {};
  if (isObj(raw.scripts)) for (const [k, v] of Object.entries(raw.scripts)) if (typeof v === 'string') scripts[k] = v;
  const keys = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, JSON.stringify(v)]));
  return { scripts, keys };
}
