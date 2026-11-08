import path from 'node:path';
import { listGuides } from '@teamtrail/core/agents';
import type { GuidesArgs, GuidesIo } from './types';

/** `guides list`: every guide the project has, where it comes from, and whether agents can use it. */
export function guidesList(a: GuidesArgs, io: GuidesIo): number {
  const guides = listGuides(path.resolve(a.dir));
  if (a.json) {
    io.out(`${JSON.stringify(guides, null, 2)}\n`);
    return 0;
  }
  for (const r of guides) {
    const origin = originOf(r.origin, typeof r.lock?.source === 'object');
    const version = r.guide?.version ?? r.lock?.version ?? '?';
    const status = r.status === 'active' ? 'active' : `${r.status}: ${r.reason ?? ''}`;
    const pending = r.pendingChecks.length ? ` · checks to approve: ${r.pendingChecks.join(', ')}` : '';
    io.out(`${r.id.padEnd(14)} ${version.padEnd(8)} ${origin.padEnd(9)} ${status}${pending}\n`);
  }
  return 0;
}

function originOf(origin: 'builtin' | 'local', fromCatalog: boolean) {
  if (origin === 'builtin') return 'built in';
  return fromCatalog ? 'catalog' : 'local';
}
