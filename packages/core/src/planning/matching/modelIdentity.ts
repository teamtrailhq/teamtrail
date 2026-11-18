/**
 * Which model a model id names, for telling whether a reviewer runs the same model as the work's author. Two ids are
 * the same model when they are equal once normalised: lower case, without a provider's routing prefix
 * (`anthropic/`, `us.anthropic.`), a context-size tag (`[1m]`), a release date (`-20250514`, `@20250514`,
 * `-2025-05-14`), a deployment version (`-v1:0`) or `-latest`. Model versions stay: `claude-opus-4-5` and
 * `claude-opus-4-6` are different models, as are `claude-opus-5-5` and `claude-sonnet-5-5` of the same vendor.
 */
export interface ModelIdentity {
  /** The normalised model id. */
  id: string;
  /** Who makes it: `anthropic`, `openai`, `google`, …, else the id's first word. */
  vendor: string;
}

const VENDORS: readonly (readonly [RegExp, string])[] = [
  [/^claude\b/, 'anthropic'],
  [/^(gpt|o\d|codex|chatgpt)\b/, 'openai'],
  [/^gemini\b/, 'google'],
  [/^grok\b/, 'xai'],
  [/^(mistral|codestral|devstral|magistral)\b/, 'mistral'],
  [/^llama\b/, 'meta'],
  [/^deepseek\b/, 'deepseek'],
  [/^qwen/, 'alibaba'],
];

const SUFFIXES: readonly RegExp[] = [
  /\[[^\]]*\]$/,
  /@\d{8}$/,
  /-v\d+(:\d+)?$/,
  /-\d{8}$/,
  /-\d{4}-\d{2}-\d{2}$/,
  /-latest$/,
];

/** Strips each known suffix until none is left, so `-20250514-v1:0` goes as a whole. */
function withoutSuffixes(id: string): string {
  let out = id;
  for (let changed = true; changed;) {
    changed = false;
    for (const s of SUFFIXES) {
      const next = out.replace(s, '');
      if (next !== out && next) {
        out = next;
        changed = true;
      }
    }
  }
  return out;
}

/** The model a model id names; undefined for no id. */
export function modelIdentity(model: string | undefined): ModelIdentity | undefined {
  const raw = model?.trim().toLowerCase();
  if (!raw) return undefined;
  const routed = raw.slice(raw.lastIndexOf('/') + 1);
  const unprefixed = routed.replace(/^(?:[a-z]{2,4}\.)?(?:anthropic|openai|google|meta|mistral)\./, '');
  const id = withoutSuffixes(unprefixed) || unprefixed;
  const vendor = VENDORS.find(([pattern]) => pattern.test(id))?.[1] ?? id.split(/[-.:]/)[0];
  return { id, vendor };
}
