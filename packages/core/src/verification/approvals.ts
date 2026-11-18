import { flakyReason } from '../flaky/flakyReason';
import { heldAsFlaky } from '../flaky/heldAsFlaky';
import type { VerificationLevel } from '../model/lifecycle';
import type { MapSnapshot } from '../model/types';
import type { VerificationAttempt, VerificationVerdict } from '../model/verification';
import { derivePhases } from '../planning/lifecycle/phase';
import { readAttempts, readVerdicts } from './evidenceStore';
import { levelFor } from './verifyCompletion';
import { waivableChecks } from './waivableChecks';

/** A ticket waiting on the trail lead: to approve a reviewed pass, or to decide a held one. */
export interface ApprovalItem {
  kind: 'approve' | 'held';
  mapId: string;
  ticketId: string;
  ticketKey: string;
  title: string;
  attemptId?: string;
  /** Why it waits, in one line: the review, the failed checks, or what could not run. */
  reason: string;
  /** Held by checks that failed: the ones the trail lead may accept it without (waivableChecks.ts). */
  waivable?: string[];
  at: number;
}

const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);

/** Tickets of a trail that wait on the trail lead, oldest first. */
export function approvalItems(root: string, snap: MapSnapshot): ApprovalItem[] {
  const phases = derivePhases(snap.tickets, snap.map.mode);
  const items: ApprovalItem[] = [];
  for (const t of snap.tickets) {
    const phase = phases.get(t.id);
    if (phase !== 'verifying' && phase !== 'blocked') continue;
    const last = readAttempts(root, snap.map.id, t.id).at(-1);
    const verdict =
      last &&
      readVerdicts(root, snap.map.id, t.id)
        .filter((v) => v.attemptId === last.id)
        .at(-1);
    const w: Waiting = {
      base: { mapId: snap.map.id, ticketId: t.id, ticketKey: t.key, title: t.title, attemptId: last?.id },
      last,
      verdict,
    };
    const item =
      phase === 'blocked'
        ? heldItem(w, t.updatedAt)
        : (signOffItem(w) ?? reviewItem(w, () => levelFor(root, snap, t).info.level));
    if (item) items.push(item);
  }
  return items.sort((a, b) => a.at - b.at);
}

interface Waiting {
  base: Pick<ApprovalItem, 'mapId' | 'ticketId' | 'ticketKey' | 'title' | 'attemptId'>;
  last?: VerificationAttempt;
  verdict?: VerificationVerdict;
}

/** A blocked ticket: a reviewer asked for the human, the checks failed too often, or they could not run. */
function heldItem({ base, last, verdict }: Waiting, updatedAt: number): ApprovalItem {
  const waivable = verdict?.verdict === 'NEEDS_HUMAN' ? [] : waivableChecks(last).map((c) => c.name);
  return {
    ...base,
    kind: 'held',
    ...(waivable.length ? { waivable } : {}),
    reason: clip(heldReason(last, verdict)),
    at: verdict?.at ?? last?.finishedAt ?? updatedAt,
  };
}

function heldReason(last?: VerificationAttempt, verdict?: VerificationVerdict): string {
  if (verdict?.verdict === 'NEEDS_HUMAN') return `${verdict.by} asks you to decide: ${verdict.summary}`;
  if (last?.result === 'fail') return `${last.id} failed its checks too many times`;
  if (last?.flaky && heldAsFlaky(last)) return `Passed only on retry: ${flakyReason(last.flaky.checks)}`;
  return last?.note ?? 'verification could not run';
}

/** A pass with manual criteria, once the checks (or the review, when there is one) passed. */
function signOffItem({ base, last, verdict }: Waiting): ApprovalItem | undefined {
  if (last?.result !== 'pass' || !last.criteria?.manual.length) return undefined;
  if (verdict?.byKind === 'trail lead') return undefined;
  const ready = last.level === 'checks' || verdict?.verdict === 'PASS';
  if (!ready) return undefined;
  const lines = last.criteria.lines.filter((l) => l.includes('sign-off')).join('; ');
  return {
    ...base,
    kind: 'approve',
    reason: clip(`Sign off ${last.criteria.manual.join(', ')}: ${lines}`),
    at: verdict?.at ?? last.finishedAt,
  };
}

/** A pass an agent reviewed, on a trail whose level asks the human to approve too. */
function reviewItem({ base, last, verdict }: Waiting, level: () => VerificationLevel): ApprovalItem | undefined {
  if (last?.result !== 'pass' || verdict?.byKind !== 'agent' || verdict.verdict !== 'PASS') return undefined;
  if (level() !== 'checks+review+human') return undefined;
  return { ...base, kind: 'approve', reason: clip(`${verdict.by} reviewed: ${verdict.summary}`), at: verdict.at };
}
