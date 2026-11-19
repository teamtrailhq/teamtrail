import type { TomlValue } from './tomlLite';

/** A string key of a TOML table (tomlLite.ts), or undefined when it's missing or a list. */
export function tomlString(
  tables: Map<string, Map<string, TomlValue>>,
  table: string,
  key: string,
): string | undefined {
  const v = tables.get(table)?.get(key);
  return typeof v === 'string' && v ? v : undefined;
}
