import path from 'node:path';
import { readJsonFile } from '../lib/jsonFile';
import { GUIDES_CONFIG_FILE, type GuidesConfig } from '../model/guide';

/**
 * The official catalog: the public teamtrailhq/teamtrail-guides repo, read over HTTPS (its index.json is built by
 * scripts/build-guide-catalog.mjs). Projects can add their own catalogs in `guides.json`.
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

function validRegistries(raw: Raw | undefined, errors: string[]): Registry[] {
  const list = Array.isArray(raw?.registries) ? (raw.registries as Partial<Registry>[]) : [];
  return list.filter((r): r is Registry => {
    const ok = !!r && typeof r.name === 'string' && !!r.name && typeof r.url === 'string' && isRegistryUrl(r.url);
    if (!ok) errors.push(`registry ${JSON.stringify(r)} needs a name and an https url`);
    return ok;
  });
}

/**
 * `guides.json`: the catalogs to search, in order. The ones it lists come first, then the official one, unless the
 * file says `"official": false` or lists the official catalog itself (its URL or its name). Missing, it's the official
 * catalog alone.
 */
export function readGuidesConfig(root: string): { config: GuidesConfig; errors: string[] } {
  const raw = readJsonFile<Raw>(path.join(root, GUIDES_CONFIG_FILE));
  const errors: string[] = [];
  const registries = validRegistries(raw, errors);
  if (raw?.official !== undefined && typeof raw.official !== 'boolean') errors.push('"official" must be true or false');
  const official = raw?.official !== false;
  const listed = registries.some((r) => r.url === DEFAULT_REGISTRY.url || r.name === DEFAULT_REGISTRY.name);
  const all = official && !listed ? [...registries, DEFAULT_REGISTRY] : registries;
  return { config: { v: 1, registries: all, official }, errors };
}
