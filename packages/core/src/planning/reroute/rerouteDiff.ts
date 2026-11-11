import type { DiffMark, DiffNode, RerouteChange, RerouteDiff } from '../../model/reroute';
import type { MapSnapshot, Ticket } from '../../model/types';
import { newEdges, removedEdges, type NewEdge } from './rerouteEdges';

/**
 * The dry run of a proposal: every ticket with how it comes out (added, cancelled, revised, rewired, reopened or
 * unchanged), its blockers afterwards and the edges that come and go, plus the trail lines that change. Pure;
 * assumes a valid proposal.
 */
export function rerouteDiff(snap: MapSnapshot, changes: RerouteChange[]): RerouteDiff {
  const marks = markOf(changes);
  const into = (edges: NewEdge[]) => (id: string) => edges.filter((e) => e.blocked === id).map((e) => e.blocker);
  const added = into(newEdges(changes));
  const removed = into(removedEdges(changes));
  const existing = snap.tickets.map((t) =>
    existingNode(t, marks.get(t.id) ?? 'unchanged', { added: added(t.id), removed: removed(t.id) }),
  );
  const destination = changes.find((c) => c.op === 'update_destination');
  const mode = changes.find((c) => c.op === 'set_mode');
  return {
    nodes: [...existing, ...changes.flatMap((c) => addedNodes(c, added))],
    ...(destination ? { destination: { before: snap.map.sections.destination, after: destination.text } } : {}),
    ...(mode ? { mode: { before: snap.map.mode, after: mode.mode } } : {}),
    ...(changes.some((c) => c.op === 'skip_discovery') ? { skipDiscovery: true } : {}),
    unspecified: changes.flatMap((c) => (c.op === 'add_unspecified' ? [c.text] : [])),
    outOfScope: changes.flatMap((c) => (c.op === 'add_out_of_scope' ? [c.text] : [])),
    superseded: changes.flatMap((c) =>
      c.op === 'supersede_decision' ? [{ decision: c.decision, answer: c.answer }] : [],
    ),
  };
}

const MARK_OF: Partial<Record<RerouteChange['op'], DiffMark>> = {
  cancel_ticket: 'cancelled',
  edit_ticket: 'revised',
  rewire: 'rewired',
  reopen: 'reopened',
};

/** The strongest mark each existing ticket gets: cancelling wins over reopening, reopening over revising, revising over rewiring. */
function markOf(changes: RerouteChange[]): Map<string, DiffMark> {
  const rank: DiffMark[] = ['unchanged', 'rewired', 'revised', 'reopened', 'cancelled'];
  const marks = new Map<string, DiffMark>();
  for (const c of changes) {
    const m = MARK_OF[c.op];
    if (!m || !('ticket' in c)) continue;
    const prev = marks.get(c.ticket) ?? 'unchanged';
    if (rank.indexOf(m) > rank.indexOf(prev)) marks.set(c.ticket, m);
  }
  return marks;
}

function existingNode(t: Ticket, mark: DiffMark, edges: { added: string[]; removed: string[] }): DiffNode {
  const kept = t.blockedBy.filter((b) => !edges.removed.includes(b));
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    type: t.type,
    mark,
    blockedBy: [...new Set([...kept, ...edges.added])],
    newEdges: edges.added,
    ...(edges.removed.length ? { removedEdges: edges.removed } : {}),
  };
}

/** `add_ticket` adds its ticket, drawn as a ghost until it's created. */
function addedNodes(c: RerouteChange, edgesInto: (id: string) => string[]): DiffNode[] {
  if (c.op !== 'add_ticket') return [];
  const blockers = edgesInto(c.ref);
  return [{ id: c.ref, title: c.title, type: c.type, mark: 'added', blockedBy: blockers, newEdges: blockers }];
}
