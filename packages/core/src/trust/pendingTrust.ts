import type { MapSnapshot } from '../model/types';
import { serializePolicy } from '../policy/policyFile';
import { POLICY_FILE, readPolicy, readPolicyFile } from '../policy/policyStore';
import { stateItems } from '../signedState/stateItems';
import { checksApproval } from '../verification/checksApproval';
import { checksDiff } from '../verification/checksDiff';
import { VERIFICATION_FILE } from '../verification/configFile';
import { levelItems } from '../verification/levelItems';
import { briefItems, criteriaItems, knowledgeItems } from './fileItems';
import type { TrustItem } from './trustItem';
import { contentHash, trustKey, trustLedger, type TrustRecord } from './trustLedger';

type Ledger = Record<string, TrustRecord>;

function checksItem(root: string): TrustItem[] {
  const a = checksApproval(root);
  if (!a.waiting) return [];
  const { lines, warnings } = checksDiff(a.approved?.content || undefined, a.text);
  const standing = a.state === 'first' ? 'elsewhere' : 'changed';
  const title = `Check commands in ${VERIFICATION_FILE}`;
  const content = a.text ?? '';
  return [
    {
      key: trustKey.checks,
      kind: 'checks',
      hash: a.hash,
      content,
      standing,
      title,
      lines,
      warnings,
      file: VERIFICATION_FILE,
    },
  ];
}

function policyItem(root: string, ledger: Ledger): TrustItem[] {
  const pending = readPolicy(root).pending;
  if (!pending) return [];
  const content = serializePolicy(readPolicyFile(root).policy);
  const standing = ledger[trustKey.policy] ? 'changed' : 'elsewhere';
  const title = 'Risk policy lowers what needs you';
  const item = { key: trustKey.policy, kind: 'policy' as const, hash: contentHash(content), content, standing, title };
  return [{ ...item, lines: pending.lowered, warnings: [], file: POLICY_FILE } as TrustItem];
}

/**
 * Everything the project's files claim that this machine's trail lead hasn't approved as it is now: the check
 * commands, accepted briefs, confirmed criteria, live knowledge, a risk policy that lowers a level, (given the
 * trails) verification levels lowered below what was approved here, and trail files changed outside Teamtrail
 * (signedState/outsideChanges.ts). Read from the files and the ledger only.
 */
export function pendingTrust(root: string, snaps: MapSnapshot[] = []): TrustItem[] {
  const ledger = trustLedger(root).all();
  return [
    ...checksItem(root),
    ...policyItem(root, ledger),
    ...levelItems(root, ledger, snaps),
    ...briefItems(root, ledger),
    ...criteriaItems(root, ledger),
    ...knowledgeItems(root, ledger),
    ...stateItems(root),
  ];
}
