import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GUIDES_CONFIG_FILE } from '../model/guide';
import { contentHash, trustKey, trustLedger, type TrustRecord } from '../trust/trustLedger';

export interface CatalogsApproval {
  /** The file as it is now; undefined when there is none. */
  text?: string;
  hash?: string;
  /** The file differs from what the trail lead approved here. No file never waits: it's the official catalog alone. */
  pending: boolean;
  approved?: TrustRecord;
}

function fileText(root: string): string | undefined {
  try {
    return readFileSync(path.join(root, GUIDES_CONFIG_FILE), 'utf8');
  } catch {
    return undefined;
  }
}

/*
 * guides.json names the addresses Teamtrail fetches guides from, and it's a file in the repo: an agent can edit it,
 * a teammate's push can bring it. So it's read only as the trail lead approved it on this machine
 * (trust/trustLedger.ts), and a change waits in Settings → Approvals like the check commands.
 */
export function catalogsApproval(root: string): CatalogsApproval {
  const text = fileText(root);
  const approved = trustLedger(root).get(trustKey.catalogs);
  if (text === undefined) return { pending: false, ...(approved ? { approved } : {}) };
  const hash = contentHash(text);
  return { text, hash, pending: approved?.hash !== hash, ...(approved ? { approved } : {}) };
}
