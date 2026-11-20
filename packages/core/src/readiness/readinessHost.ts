import path from 'node:path';
import type { ReadinessHost } from '../model/readiness';
import type { CheckRunner } from '../verification/checkRunner';
import { localRepoFiles } from '../verification/localRepoFiles';

/**
 * Where readiness is read for the tracker folder `root`: an embedding server's own host when it gives one, else this
 * machine's checkout, probed here unless checks run on the server's runner. A runner that holds no checkout of the
 * work (`holdsCode: false`, Cloud's engine, whose folder can sit inside an unrelated clone) reads nothing here, so
 * another repo's files never hold work.
 */
export function readinessHost(o: { root: string; host?: ReadinessHost; checkRunner?: CheckRunner }): ReadinessHost {
  if (o.host) return o.host;
  if (o.checkRunner?.holdsCode === false) return { files: () => undefined, probe: false };
  const repoRoot = path.dirname(o.root);
  return { files: () => localRepoFiles(repoRoot), probe: !o.checkRunner };
}
