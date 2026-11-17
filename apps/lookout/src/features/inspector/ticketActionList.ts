import type { MenuItem } from '../../components/ui';
import type { TicketRunners } from './types';
import type { TicketView } from './useTicketView';

type Item = MenuItem | false | undefined;

/**
 * Every action the trail lead can take on the ticket right now, in the order the "⋯" menu lists them. The bar
 * takes the one its standing names as its primary button; the rest stay in the menu.
 */
export function ticketActionList(v: TicketView, run: TicketRunners): MenuItem[] {
  return [...claimActions(v, run), ...checkActions(v, run), ...criteriaActions(v, run), ...otherActions(v, run)].filter(
    (i): i is MenuItem => !!i,
  );
}

function claimActions(v: TicketView, run: TicketRunners): Item[] {
  const { state, mine } = v;
  const ready = state === 'frontier';
  return [
    ready && { id: 'claim', label: 'Claim', tip: 'Take it yourself, so no agent picks it up', onSelect: run.claim },
    (ready || (state === 'claimed' && mine)) && {
      id: 'resolve',
      label: 'Resolve myself…',
      tip: 'Answer it yourself and close the ticket, with a decision record',
      onSelect: () => run.form('resolve'),
    },
    mine && state === 'claimed' && { id: 'release', label: 'Give back to the queue', onSelect: run.release },
    !!v.lease && {
      id: 'release-lease',
      label: 'Release to queue',
      tip: 'Take the claim back from the agent; its notes go to the next one',
      onSelect: run.releaseLease,
    },
  ];
}

function checkActions(v: TicketView, run: TicketRunners): Item[] {
  const live = v.state === 'verifying' || v.state === 'held';
  if (!live || v.verification?.running) return [];
  // the queue's approval item says it was submitted before the ticket's own record has loaded
  const submitted = !!v.verification?.attempts.length || v.items.some((i) => i.kind === 'approval');
  const held = v.state === 'held';
  return [
    v.state === 'verifying' &&
      submitted && {
        id: 'approve',
        label: 'Approve',
        tip: 'Approve the work and close the ticket',
        onSelect: run.approve,
      },
    submitted && {
      id: 'rerun',
      label: 'Re-run checks',
      tip: "Run the repo's checks again on the current code",
      onSelect: run.rerun,
    },
    {
      id: 'rework',
      label: 'Send to rework…',
      tip: 'Back to an agent with what to fix',
      onSelect: () => run.form('rework'),
    },
    held && {
      id: 'unblock',
      label: 'Unblock…',
      tip: 'Back to the queue without running checks',
      onSelect: () => run.form('unblock'),
    },
    held && {
      id: 'accept',
      label: 'Accept anyway…',
      tip: 'Close it as done despite the checks',
      onSelect: () => run.form('accept'),
    },
  ];
}

function criteriaActions(v: TicketView, run: TicketRunners): Item[] {
  const c = v.criteria;
  const open = v.t.state === 'open';
  const confirmable = open && c.criteria.length > 0 && !(c.changed && !c.confirmed);
  const offered = !!c.proposal && !c.proposalChanged;
  return [
    confirmable &&
      !c.confirmed && {
        id: 'confirm-criteria',
        label: 'Confirm criteria',
        tip: 'Agree that these criteria define done for this ticket',
        onSelect: () => run.criteria(true),
      },
    confirmable &&
      c.confirmed && { id: 'unconfirm-criteria', label: 'Unconfirm criteria', onSelect: () => run.criteria(false) },
    offered && {
      id: 'take-criteria',
      label: 'Take the new criteria',
      tip: 'Replace yours with the proposed ones',
      onSelect: run.take,
    },
    offered && { id: 'keep-criteria', label: 'Keep my criteria', tip: 'Drop the proposal', onSelect: run.keep },
  ];
}

function otherActions(v: TicketView, run: TicketRunners): Item[] {
  const { state, t } = v;
  return [
    t.state === 'open' && {
      id: 'edit-how',
      label: 'Change guides or verification',
      tip: 'The guides and the verification level for this ticket alone',
      onSelect: run.editHow,
    },
    !!v.change && {
      id: 'review-change',
      label: 'Review the change',
      tip: 'Accept or revert it in Approvals',
      onSelect: run.reviewChange,
    },
    v.brief?.status === 'submitted' && { id: 'review-brief', label: 'Review the brief', onSelect: run.reviewBrief },
    !!v.proof && {
      id: 'copy-proof',
      label: 'Copy proof for PR',
      tip: 'The signed report, as Markdown',
      onSelect: run.copyProof,
    },
    !!v.workspace && {
      id: 'remove-workspace',
      label: 'Remove workspace…',
      tip: 'Delete its worktree folder; the branch stays',
      onSelect: () => run.form('workspace'),
    },
    t.closeReason === 'not_planned' && {
      id: 'dead-end',
      label: 'Save as dead end',
      tip: 'Add it to the field guide as a suggestion, so agents learn from it',
      onSelect: run.deadEnd,
    },
    (state === 'frontier' || state === 'blocked' || state === 'parked') && {
      id: 'rule',
      label: 'Rule out…',
      tip: "Move it out of scope. It's set aside with your reason, not deleted",
      danger: true,
      onSelect: () => run.form('rule'),
    },
  ];
}
