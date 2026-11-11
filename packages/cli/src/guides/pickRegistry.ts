import { readGuidesConfig, type Registry } from '@teamtrail/core/agents';
import { hostOf } from './hostOf';

const named = (rs: Registry[]) => rs.map((x) => `${x.name} (${hostOf(x.url)})`).join(', ');

/**
 * The catalogs to use: the one named with --registry, else every catalog: those in guides.json as approved on this
 * machine, then the official one (readGuidesConfig).
 */
export function pickRegistries(root: string, name?: string): Registry[] {
  const { registries } = readGuidesConfig(root).config;
  if (!name) return registries;
  const r = registries.find((x) => x.name === name);
  if (!r) throw new Error(`no catalog named "${name}" in guides.json (have: ${named(registries)})`);
  return [r];
}

/**
 * The catalog a guide came from, by the address this machine recorded when it was approved, only while that address
 * is still one of the catalogs approved here. Anything else (an address only the repo's lock names, a catalog removed
 * from guides.json) is never fetched.
 */
export function registryForUrl(root: string, url: string): Registry | undefined {
  return readGuidesConfig(root).config.registries.find((r) => r.url === url);
}
