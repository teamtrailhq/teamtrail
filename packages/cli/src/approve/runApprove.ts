import type { MapSnapshot, TrustItem } from '@teamtrail/core';
import { approveTrust, pendingTrust, withCommitted } from '@teamtrail/core/agents';
import type { GuidesIo } from '../guides/types';
import { showItem } from './showItem';

export interface ApproveInput {
  /** The tracker folder. */
  root: string;
  io: Pick<GuidesIo, 'out' | 'err' | 'interactive' | 'confirm'>;
  /** `--hash`: approve exactly these items, without asking. */
  hashes: string[];
  /** The trails, for their verification levels. */
  snaps?: MapSnapshot[];
}

const approveOne = (root: string, item: TrustItem, snaps?: MapSnapshot[]) =>
  approveTrust({ root, items: [{ key: item.key, hash: item.hash }], by: 'trail lead', snaps }).approved.length === 1;

/** `--hash`: each one must name a pending item exactly as it is now; nothing else is approved. */
function byHash(input: ApproveInput, items: TrustItem[]): number {
  let code = 0;
  for (const hash of input.hashes) {
    const item = items.find((i) => i.hash === hash);
    if (item && approveOne(input.root, item, input.snaps)) {
      input.io.out(`  approved: ${item.title}\n`);
      continue;
    }
    input.io.err(`  nothing waiting has hash ${hash} (it may have changed): not approved\n`);
    code = 1;
  }
  return code;
}

/**
 * `teamtrail approve`: the Lookout's Settings → Approvals in a terminal, for CI and servers. It shows exactly what
 * each item would approve and asks y/N for each, one at a time. Without a terminal it approves nothing unless
 * `--hash` names the exact content to approve. Returns the exit code.
 */
export async function runApprove(input: ApproveInput): Promise<number> {
  const items = withCommitted(input.root, pendingTrust(input.root, input.snaps));
  if (!items.length)
    return (input.io.out('\n  Nothing waiting: everything the repo asks for is approved here.\n\n'), 0);
  for (const item of items) input.io.out(showItem(item));
  if (input.hashes.length) return byHash(input, items);
  if (!input.io.interactive) {
    input.io.err('\n  approve asks you in a terminal. Without one, name exactly what you approve: --hash <hash>\n\n');
    return 1;
  }
  for (const item of items) {
    if (!(await input.io.confirm(`\n  Approve "${item.title}"? [y/N] `))) continue;
    input.io.out(
      approveOne(input.root, item, input.snaps) ? '  approved\n' : '  it changed while you read it: not approved\n',
    );
  }
  return 0;
}
