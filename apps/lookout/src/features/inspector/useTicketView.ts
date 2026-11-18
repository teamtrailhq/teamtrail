import { type AttentionView, type MapSnapshot, type SessionInfo, type Ticket, deriveStates } from '@teamtrail/core';
import { usePrSync, useNow, type LookoutApi } from '../../hooks';
import { TRAIL_LEAD, heldLeases, isRunning, prSync } from '../../lib';
import { useTicketCriteria } from '../criteria';
import { useBrief } from '../discovery';
import { useModels } from '../models';
import { useTicketProof } from '../proof';
import { useSignedState } from '../signed-state';
import { useVerification } from '../verification';
import { useWorkspaces } from '../workspaces';
import { chipInput } from './chipInput';
import { chipsOfTicket } from './chipsOfTicket';
import { standingInput } from './standingInput';
import { ticketNotices } from './ticketNotices';
import { ticketStanding } from './ticketStanding';
import type { LoadedTicket } from './types';

/**
 * Everything the ticket inspector shows, loaded once and shared by the state line, the action bar and the sections:
 * the claim and the agent's session, verification and proof, criteria, the workspace, PR sync, what changed outside
 * Teamtrail, the discovery gate, model matching and the queue's items on this ticket.
 */
export function useTicketView(input: {
  snap: MapSnapshot;
  t: Ticket;
  api: LookoutApi;
  sessions: SessionInfo[];
  attention?: AttentionView;
}) {
  const { snap, t, api } = input;
  const mapId = snap.map.id;
  const now = useNow(1000);
  const state = deriveStates(snap.tickets, snap.map.mode).get(t.id)!;
  const verification = useVerification(mapId, t.id, t.updatedAt);
  const proof = useTicketProof(mapId, t.id);
  const criteria = useTicketCriteria(snap, t);
  const signed = useSignedState();
  const models = useModels();
  const pr = prSync.ticket(usePrSync(), mapId, t.id);
  const brief = useBrief(snap);
  const workspaces = useWorkspaces();
  const same = (i: { mapId: string; kind: string; id: string }) =>
    i.mapId === mapId && i.kind === 'ticket' && i.id === t.id;
  const loaded: LoadedTicket = {
    t,
    snap,
    state,
    now,
    mine: t.assignee === TRAIL_LEAD,
    lease: t.state === 'open' ? heldLeases(api.leases, mapId).get(t.id) : undefined,
    session: input.sessions.find((s) => s.ticketId === t.id && isRunning(s)),
    question: api.activity.pending.find((q) => q.mapId === mapId && q.ticketId === t.id),
    items: (input.attention?.items ?? []).filter((i) => i.mapId === mapId && i.ticketId === t.id),
    interrupting: input.attention?.interrupting ?? [],
    verification: verification.data,
    proof: proof ?? undefined,
    pr,
    change: signed?.changes.find(same),
    textEdited: !!signed?.textEdits.some(same),
    brief: brief.gated ? brief.brief : null,
    modelWait: models?.waiting.find((w) => w.mapId === mapId && w.ticketId === t.id),
    workspace: workspaces.view?.workspaces.find((w) => w.mapId === mapId && w.ticketId === t.id && !w.active),
    decisions: api.decisions.filter((d) => d.mapId === mapId && d.ticketId === t.id),
  };
  const notices = ticketNotices(loaded);
  const standing = ticketStanding({ ...standingInput(loaded), atRisk: notices.some((n) => n.risk) });
  return {
    ...loaded,
    reloadVerification: verification.reload,
    criteria,
    removeWorkspace: (force: boolean) => workspaces.remove(mapId, t.id, force),
    standing,
    notices,
    chips: chipsOfTicket(chipInput(loaded)),
  };
}

export type TicketView = ReturnType<typeof useTicketView>;
