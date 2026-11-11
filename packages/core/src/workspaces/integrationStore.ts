import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { IntegrationScan } from './workspace';

const file = (root: string) => path.join(root, AGENTS_DIR, 'integration.json');

/** The latest overlap check between active claim branches; none yet means no overlaps. */
export function readIntegrationScan(root: string): IntegrationScan {
  const s = readJsonFile<IntegrationScan>(file(root));
  return s?.v === 1 ? s : { v: 1, at: 0, overlaps: [] };
}

export function writeIntegrationScan(root: string, s: IntegrationScan) {
  ensureLocalDir(path.join(root, AGENTS_DIR));
  writeJsonAtomic(file(root), s);
}
