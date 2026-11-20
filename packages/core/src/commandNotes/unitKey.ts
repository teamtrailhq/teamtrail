import type { RepoUnit } from '../model/repoProfile';

/** The source a unit's command note carries: `unit:apps/web:node`, `unit:.:python` for the top. */
export const unitKey = (u: Pick<RepoUnit, 'dir' | 'ecosystem'>) => `unit:${u.dir || '.'}:${u.ecosystem}`;
