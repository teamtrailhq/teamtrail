import type { WaivableCheck } from '@teamtrail/core';
import { useState } from 'react';
import type { ButtonVariant, MenuItem } from '../../components/ui';
import type { LookoutApi } from '../../hooks';
import { TRAIL_LEAD } from '../../lib';
import { type ActionRequest, verificationApi } from '../../lib/verification';
import { useKnowledge } from '../knowledge';
import { ticketActionList } from './ticketActionList';
import type { Form, PrimaryKind, TicketRunners } from './types';
import type { TicketView } from './useTicketView';

/** The menu item each primary action is. */
const PRIMARY_ID: Record<PrimaryKind, string> = {
  answer: 'answer',
  approve: 'approve',
  accept: 'accept',
  waive: 'waive',
  unblock: 'unblock',
  release: 'release-lease',
  resolve: 'resolve',
  'review-brief': 'review-brief',
  'review-change': 'review-change',
  'confirm-criteria': 'confirm-criteria',
  'take-criteria': 'take-criteria',
};

export type ReasonRequest = Omit<ActionRequest, 'mapId' | 'ticketId'>;

/**
 * The ticket's action bar: the one next action (red only when it needs the human now), the rest for the "⋯" menu,
 * and what an action said back (an error, "Copied").
 */
export function useTicketActions(input: {
  v: TicketView;
  api: LookoutApi;
  setForm: (form: Form) => void;
  onEditHow: () => void;
  onOpenChat: (sessionId: string) => void;
  onReviewChange?: () => void;
  onReviewBrief?: (mapId: string) => void;
}) {
  const { v, api } = input;
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const k = useKnowledge();
  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(undefined), 2500);
  };
  const failed = (e?: string) => setError(e);
  const act = (req: ReasonRequest) => {
    setError(undefined);
    return verificationApi
      .act({ ...req, mapId: v.snap.map.id, ticketId: v.t.id, by: TRAIL_LEAD })
      .then(v.reloadVerification, (e: Error) => setError(e.message));
  };
  const waive = (req: { checks: WaivableCheck[]; reason: string }) => {
    const attemptId = v.verification?.attempts[0]?.id ?? '';
    const checks = req.checks.map((c) => ({ name: c.name, hash: c.hash }));
    setError(undefined);
    return verificationApi
      .waive({ mapId: v.snap.map.id, ticketId: v.t.id, attemptId, checks, reason: req.reason })
      .then(v.reloadVerification, (e: Error) => setError(e.message));
  };
  const runners: TicketRunners = {
    form: (f) => input.setForm(f),
    claim: () => void api.actions.claim(v.t.id),
    release: () => void api.actions.release(v.t.id),
    releaseLease: () => void api.actions.releaseLease(v.t.id),
    approve: () => void act({ action: 'approve' }),
    rerun: () => void act({ action: 'rerun' }),
    undoWaiver: () =>
      void verificationApi
        .undoWaiver({ mapId: v.snap.map.id, ticketId: v.t.id })
        .then(v.reloadVerification, (e: Error) => setError(e.message)),
    criteria: (confirmed) => void v.criteria.setConfirmed(confirmed).then(failed),
    take: () => void v.criteria.take().then(failed),
    keep: () => void v.criteria.keep().then(failed),
    editHow: input.onEditHow,
    reviewChange: () => input.onReviewChange?.(),
    reviewBrief: () => input.onReviewBrief?.(v.snap.map.id),
    copyProof: () => void navigator.clipboard.writeText(v.proof?.markdown ?? '').then(() => flash('Copied for PR')),
    deadEnd: () =>
      void k
        .propose({
          title: `Ruled out: ${v.t.title}`,
          body: v.t.comments.at(-1)?.body ?? v.t.body,
          kind: 'dead-end',
          sources: [`trail:${v.snap.map.key}`, `ticket:${v.t.key}`],
        })
        .then((e) => e && flash(`Saved as ${e.id} in the field guide`)),
  };
  const all = ticketActionList(v, runners);
  const answer = answerItem(v, input.onOpenChat);
  const named = v.standing.primary;
  // nothing waits on the human: an agent's proposed criteria, else unconfirmed ones, are the useful next step
  const fallback = all.find((a) => a.id === 'take-criteria') ?? all.find((a) => a.id === 'confirm-criteria');
  const primary = answer ?? all.find((a) => named && a.id === PRIMARY_ID[named]) ?? fallback;
  const variant: ButtonVariant = primaryVariant({
    urgent: v.standing.edge === 'urgent',
    named: !!named && primary !== fallback,
  });
  const menu = all.filter((a) => a !== primary);
  return { primary, variant, menu, error, note, act, waive, undoWaiver: runners.undoWaiver };
}

function answerItem(v: TicketView, open: (sessionId: string) => void): MenuItem | undefined {
  const q = v.question;
  if (v.standing.primary !== 'answer' || !q) return undefined;
  return {
    id: 'answer',
    label: 'Answer',
    tip: `${q.agent} is waiting for your answer`,
    onSelect: () => open(q.sessionId),
  };
}

/** Red when the ticket needs the human now; filled when it waits on them; plain for an optional next step. */
function primaryVariant(p: { urgent: boolean; named: boolean }): ButtonVariant {
  if (p.urgent) return 'urgent';
  return p.named ? 'primary' : 'default';
}
