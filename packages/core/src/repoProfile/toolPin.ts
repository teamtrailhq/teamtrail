import type { Toolchain } from '../model/repoProfile';
import { tomlTables } from './tomlLite';
import type { UnitContext } from './types';

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** The first word of a version file (`.nvmrc`, `.python-version`), without a leading `v`. */
const firstWord = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .find(Boolean)
    ?.split(/\s+/)[0]
    ?.replace(/^v(?=\d)/, '');

/** A version from `.tool-versions` (`nodejs 20.11.0`) or mise.toml (`[tools] node = "20"`) at the top. */
async function sharedPin(ctx: UnitContext, aliases: string[]): Promise<{ version: string; from: string } | undefined> {
  const tv = await ctx.reader.read('.tool-versions');
  for (const line of tv?.split('\n') ?? []) {
    const [tool, version] = line.replace(/#.*/, '').trim().split(/\s+/);
    if (tool && version && aliases.includes(tool)) return { version, from: '.tool-versions' };
  }
  for (const file of ['mise.toml', '.mise.toml']) {
    const text = await ctx.reader.read(file);
    const tools = text === undefined ? undefined : tomlTables(text).get('tools');
    const version = aliases.map((a) => tools?.get(a)).find((v) => typeof v === 'string' && v);
    if (typeof version === 'string') return { version, from: file };
  }
  return undefined;
}

/**
 * A toolchain version pinned for a unit: in one of `files` in its own folder, then the top folder's, then the top's
 * `.tool-versions` or mise.toml under one of `aliases`. Files only, nothing probed.
 */
export async function toolPin(
  ctx: UnitContext,
  o: { name: string; files: string[]; aliases: string[] },
): Promise<Toolchain | undefined> {
  for (const folder of ctx.folder.dir === ctx.top.dir ? [ctx.folder] : [ctx.folder, ctx.top]) {
    for (const file of o.files.filter((f) => folder.files.has(f))) {
      const path = join(folder.dir, file);
      const version = firstWord((await ctx.reader.read(path)) ?? '');
      if (version) return { name: o.name, version, from: path };
    }
  }
  const shared = await sharedPin(ctx, o.aliases);
  return shared && { name: o.name, ...shared };
}
