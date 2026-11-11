import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import type { MapSnapshot } from '../model/types';
import { firstRun } from './firstRun';
import { pendingTrust } from './pendingTrust';
import { recordShown } from './recordShown';
import type { TrustItem } from './trustItem';
import { isCommitted } from './withCommitted';

export interface ApproveTrustInput {
  root: string;
  /** Each item as the page showed it: its key and the hash of the content shown. */
  items: { key: string; hash: string }[];
  by: string;
  /** The trails, for their verification levels (levelItems.ts). */
  snaps?: MapSnapshot[];
  /** The pending files committed to git as they are (committedFiles.ts); needed to approve several at once. */
  committed?: Set<string>;
  /** The files git confirms were never committed (`absentFile` of an item). */
  absent?: Set<string>;
}

/** Why an item can't be approved in this request, or undefined when it can. */
function why(item: TrustItem | undefined, want: { hash: string }, bulk: { on: boolean; first: boolean }) {
  if (!item) return 'gone';
  if (item.hash !== want.hash) return 'changed';
  if (bulk.on && (item.alone || !(bulk.first && item.committed))) return 'refused';
  return undefined;
}

/**
 * The trail lead approves pending items on this machine, each exactly as the page showed it (recordShown.ts).
 *   - An item whose content changed since (another hash) is left waiting, in `changed`: never approved unseen.
 *   - Approving several at once is for the first run on this machine only (`firstRun`), and adopts only items
 *     committed to git as they are (`withCommitted`). Anything else is approved one at a time, read whole, and is
 *     listed in `refused` here. (Committing is something an agent with a shell can do too: once this machine has
 *     approved anything, every later item gets its own look.)
 * Every approval is journaled. One call approves any number of committed items, which is how a project from before
 * approvals were kept per machine, or a fresh clone, is adopted in one step.
 */
export function approveTrust(input: ApproveTrustInput) {
  const { root, by } = input;
  const bulk = { on: input.items.length > 1, first: firstRun(root) };
  const all = pendingTrust(root, input.snaps);
  const committed = (i: TrustItem) => isCommitted(root, i, input);
  const shown = bulk.on ? all.map((i) => ({ ...i, committed: committed(i) })) : all;
  const pending = new Map(shown.map((i) => [i.key, i]));
  const out = { approved: [] as TrustItem[], changed: [] as string[], refused: [] as string[] };
  for (const want of input.items) {
    const item = pending.get(want.key);
    const problem = why(item, want, bulk);
    if (problem === 'changed') out.changed.push(want.key);
    if (problem === 'refused') out.refused.push(want.key);
    if (problem) continue;
    recordShown({ root, item: item!, by });
    out.approved.push(item!);
  }
  journal(root, out.approved, by);
  return {
    approved: out.approved.map((i) => i.key),
    changed: out.changed,
    refused: out.refused,
    pending: pendingTrust(root, input.snaps),
  };
}

function journal(root: string, items: TrustItem[], by: string) {
  const j = journalFile(root);
  const action = items.length > 1 ? 'adopted' : 'approved';
  for (const item of items)
    j.append({
      v: 1,
      kind: 'trust',
      at: Date.now(),
      mapId: TRUST_JOURNAL,
      action,
      subject: item.title,
      detail: item.hash,
      actor: by,
      actorKind: 'trail lead',
    });
}
