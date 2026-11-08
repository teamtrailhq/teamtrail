import type { IncomingMessage, ServerResponse } from 'node:http';
import { addFromCatalog, previewCatalogGuide } from '../guides/addFromCatalog';
import { fetchCatalog, type Registry } from '../guides/catalogClient';
import { readGuidesConfig } from '../guides/guidesConfig';
import { OperationError } from '../planning/operations/operationError';
import { journalGuide, guidesView, TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

/** A catalog from `guides.json` by name; the first one when no name is given. */
function registryOf(root: string, name: string | null | undefined): Registry {
  const { registries } = readGuidesConfig(root).config;
  const r = name ? registries.find((x) => x.name === name) : registries[0];
  if (!r) throw new BadRequest(`no catalog named "${name}" in guides.json`);
  return r;
}

/**
 * `/guides/catalog`: GET `?registry` lists a catalog's index; GET `/guides/catalog/preview?registry&id` fetches one
 * guide, sha-checked and linted, without writing anything; POST `/guides/catalog/add { registry, id }` installs and pins
 * it (journaled). A catalog that can't be reached answers 502; a refused install 409.
 */
export async function handleGuideCatalog(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    if (url.pathname === '/guides/catalog' && req.method === 'GET') {
      const registry = registryOf(ctx.root, url.searchParams.get('registry'));
      const index = await fetchCatalog(registry);
      return (sendJson(res, 200, { registry, ...index }), true);
    }
    if (url.pathname === '/guides/catalog/preview' && req.method === 'GET') {
      const registry = registryOf(ctx.root, url.searchParams.get('registry'));
      const id = url.searchParams.get('id') ?? '';
      const p = await previewCatalogGuide({ registry, id });
      return (sendJson(res, 200, { registry, entry: p.entry, text: p.text, repo: p.repo, ...p.lint }), true);
    }
    if (url.pathname === '/guides/catalog/add' && req.method === 'POST') return await add(ctx, req, res);
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    const unreachable = /couldn't reach|answered|not JSON|not a guide catalog/.test(e.message);
    return (sendJson(res, unreachable ? 502 : 409, { error: e.message }), true);
  }
  return false;
}

async function add(ctx: RouteContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ registry?: unknown; id?: unknown }>(req, '{}');
  if (typeof b.id !== 'string' || !b.id) throw new BadRequest('"id" is required');
  const registry = registryOf(ctx.root, typeof b.registry === 'string' ? b.registry : undefined);
  const r = await addFromCatalog({ root: ctx.root, registry, id: b.id, by: TRAIL_LEAD });
  journalGuide(ctx.root, { action: r.updated ? 'updated' : 'installed', guide: r.guide.id, version: r.guide.version });
  const installed = { id: r.guide.id, version: r.guide.version, pendingChecks: r.pendingChecks };
  sendJson(res, 200, { installed, ...guidesView(ctx.root) });
  return true;
}
