import { readRolesConfig, type Registry } from '@teamtrail/core/agents';

/** The catalogs to use: the one named with --registry, else every catalog in roles.json (the official one by default). */
export function pickRegistries(root: string, name?: string): Registry[] {
  const { registries } = readRolesConfig(root).config;
  if (!name) return registries;
  const r = registries.find((x) => x.name === name);
  if (!r)
    throw new Error(`no catalog named "${name}" in roles.json (have: ${registries.map((x) => x.name).join(', ')})`);
  return [r];
}

/** The catalog a lockfile source points at: the configured one with that URL, else the URL itself. */
export function registryForUrl(root: string, url: string): Registry {
  return readRolesConfig(root).config.registries.find((r) => r.url === url) ?? { name: url, url };
}
