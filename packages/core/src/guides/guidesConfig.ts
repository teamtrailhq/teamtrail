import path from 'node:path';
import { readJsonFile } from '../lib/jsonFile';
import { GUIDES_CONFIG_FILE, type GuidesConfig } from '../model/guide';

/**
 * The official catalog: a public git repo of guide files, read over HTTPS. It doesn't exist yet; the maintainers
 * create it (see scripts/build-guide-catalog.mjs). Projects can list other catalogs in `guides.json`.
 */
export const DEFAULT_REGISTRY = {
  name: 'teamtrail',
  url: 'https://raw.githubusercontent.com/teamtrailhq/teamtrail-guides/main',
};

/** HTTPS only, except a catalog on this machine (tests, a local checkout served for review). */
export const isRegistryUrl = (u: string) =>
  /^https:\/\/\S+$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/.test(u);

/** `guides.json`: the catalogs to search, in order. Missing, or with no valid registry, means the official one. */
export function readGuidesConfig(root: string): { config: GuidesConfig; errors: string[] } {
  const raw = readJsonFile<Partial<GuidesConfig>>(path.join(root, GUIDES_CONFIG_FILE));
  const errors: string[] = [];
  const registries = (Array.isArray(raw?.registries) ? raw.registries : []).filter((r) => {
    const ok = !!r && typeof r.name === 'string' && !!r.name && typeof r.url === 'string' && isRegistryUrl(r.url);
    if (!ok) errors.push(`registry ${JSON.stringify(r)} needs a name and an https url`);
    return ok;
  });
  return { config: { v: 1, registries: registries.length ? registries : [DEFAULT_REGISTRY] }, errors };
}
