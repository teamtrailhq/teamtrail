import { GUIDES_CONFIG_FILE, type GuidesConfig } from '../model/guide';
import { parseJsonSafe } from '../model/safeKey';
import { catalogsApproval } from './catalogsApproval';

/**
 * The official catalog: the public teamtrailhq/teamtrail-guides repo, read over HTTPS (its index.json is built by
 * scripts/build-guide-catalog.mjs). Projects can add their own catalogs in `guides.json`. Its name is reserved: no
 * entry of guides.json may call another address "teamtrail".
 */
export const DEFAULT_REGISTRY = {
  name: 'teamtrail',
  url: 'https://raw.githubusercontent.com/teamtrailhq/teamtrail-guides/main',
};

/** HTTPS only, except a catalog on this machine (tests, a local checkout served for review). */
export const isRegistryUrl = (u: string) =>
  /^https:\/\/\S+$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/.test(u);

type Raw = { registries?: unknown; official?: unknown };
type Registry = GuidesConfig['registries'][number];

function registryProblem(r: Partial<Registry> | null | undefined): string | undefined {
  const shown = JSON.stringify(r);
  if (!r || typeof r.name !== 'string' || !r.name || typeof r.url !== 'string' || !isRegistryUrl(r.url))
    return `registry ${shown} needs a name and an https url`;
  if (r.name === DEFAULT_REGISTRY.name && r.url !== DEFAULT_REGISTRY.url)
    return `registry ${shown}: "${DEFAULT_REGISTRY.name}" is the official catalog's name; give this one another`;
  return undefined;
}

function validRegistries(raw: Raw | undefined, errors: string[]): Registry[] {
  const list = Array.isArray(raw?.registries) ? (raw.registries as Partial<Registry>[]) : [];
  return list.filter((r): r is Registry => {
    const problem = registryProblem(r);
    if (problem) errors.push(problem);
    return !problem;
  });
}

function parseRaw(text: string | undefined, errors: string[]): Raw | undefined {
  if (text === undefined) return undefined;
  try {
    return (parseJsonSafe(text) ?? undefined) as Raw | undefined;
  } catch {
    errors.push(`${GUIDES_CONFIG_FILE} is not valid JSON`);
    return undefined;
  }
}

/** The catalogs a guides.json text names, in order, and what's wrong with it. No text: the official catalog alone. */
export function parseGuidesConfig(text: string | undefined): { config: GuidesConfig; errors: string[] } {
  const errors: string[] = [];
  const raw = parseRaw(text, errors);
  const registries = validRegistries(raw, errors);
  if (raw?.official !== undefined && typeof raw.official !== 'boolean') errors.push('"official" must be true or false');
  const official = raw?.official !== false;
  const listed = registries.some((r) => r.url === DEFAULT_REGISTRY.url);
  const all = official && !listed ? [...registries, DEFAULT_REGISTRY] : registries;
  return { config: { v: 1, registries: all, official }, errors };
}

/**
 * The catalogs to search, in order: those guides.json lists, then the official one, unless the file says
 * `"official": false` or lists the official catalog itself (its URL). Read as approved on this machine
 * (catalogsApproval.ts): while the file differs, the last approved version is used, or the official catalog alone,
 * and `pending` says so. Missing, it's the official catalog alone.
 */
export function readGuidesConfig(root: string): { config: GuidesConfig; errors: string[]; pending: boolean } {
  const a = catalogsApproval(root);
  const used = a.pending ? a.approved?.content : a.text;
  const parsed = parseGuidesConfig(used || undefined);
  const waiting = a.pending
    ? [`${GUIDES_CONFIG_FILE} changed; it waits for your approval in Settings → Approvals`]
    : [];
  return { ...parsed, errors: [...waiting, ...parsed.errors], pending: a.pending };
}
