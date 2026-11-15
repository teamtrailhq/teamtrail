import { realpathSync } from 'node:fs';
import type { Precedent, PrecedentQuery } from '../model/precedent';
import { fileAdapter } from '../projects/fileAdapter';
import { readProjects } from '../projects/projectsFile';
import { findPrecedents } from './findPrecedents';
import { precedentAreas } from './precedentAreas';

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * Decisions from this person's other projects that share their decisions (Settings → Projects), as suggestions
 * only: another repo's call never answers for this one. Markdown trackers only (no network); each named by project.
 */
export async function otherProjectPrecedents(o: {
  configDir: string;
  root: string;
  query: PrecedentQuery;
}): Promise<Precedent[]> {
  const self = real(o.root);
  const out: Precedent[] = [];
  for (const p of readProjects(o.configDir).projects) {
    if (p.sharePrecedents !== true || real(p.root) === self) continue;
    const adapter = fileAdapter(p.root, o.configDir);
    if (!adapter) continue;
    const decisions = (await Promise.all((await adapter.listMaps()).map((m) => adapter.listDecisions(m.id)))).flat();
    // Another repo's tickets and files mean nothing here: only wording, assumptions and named ids carry over.
    const query = { ...o.query, ticketId: undefined, paths: undefined };
    for (const found of findPrecedents({ query, decisions, areas: precedentAreas(p.root, decisions) }))
      out.push({ ...found, strength: 'suggested', project: p.name });
  }
  return out.sort((a, b) => b.decidedAt - a.decidedAt).slice(0, 5);
}
