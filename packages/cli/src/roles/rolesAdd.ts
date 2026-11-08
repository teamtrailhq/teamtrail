import { readFileSync } from 'node:fs';
import path from 'node:path';
import { previewCatalogRole } from '@teamtrail/core/agents';
import { installText } from './installText';
import { pickRegistries } from './pickRegistry';
import type { RolesArgs, RolesIo } from './types';

const isFile = (ref: string) => ref.endsWith('.md') || ref.includes('/') || ref.includes(path.sep);

/** `roles add <id>|<file.md>`: from the catalog (sha-checked against its index) or a local file. */
export async function rolesAdd(a: RolesArgs, io: RolesIo): Promise<number> {
  const ref = a.rest[0];
  if (!ref) {
    io.err('usage: roles add <id>|<file.md> [--registry <name>] [--approve-checks]\n');
    return 2;
  }
  const root = path.resolve(a.dir);
  const common = { root, io, approveAll: a.approveChecks };
  if (isFile(ref)) {
    const text = readFileSync(path.resolve(ref), 'utf8');
    return installText({ ...common, text, source: 'local', where: ref });
  }
  const registry = pickRegistries(root, a.registry)[0];
  const p = await previewCatalogRole({ registry, id: ref, fetch: io.fetch });
  const commit = p.entry.history.at(-1)?.commit;
  const source = { registry: registry.url, path: p.entry.path, ...(commit ? { commit } : {}) };
  const where = `${registry.name}:${p.entry.path}`;
  return installText({ ...common, text: p.text, source, where, expectId: p.entry.id });
}
