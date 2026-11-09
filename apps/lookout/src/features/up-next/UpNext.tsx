import { type MapSnapshot, type ActivityState, deriveStates, type NodeState, attention } from '@teamtrail/core';
import { SectionHeader, Empty } from '../../components/ui';
import { type Selection, STATE_TEXT, isWaiting } from '../../lib';

/** Layer 3: the tickets that can move now (frontier) or are moving (claimed), as a compact list. */
export function UpNext(props: {
  snap?: MapSnapshot;
  sessions: ActivityState['sessions'];
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const { snap } = props;
  const states = snap ? deriveStates(snap.tickets, snap.map.mode) : new Map<string, NodeState>();
  const rank: Partial<Record<NodeState, number>> = { claimed: 0, frontier: 1 };
  const items = (snap?.tickets ?? [])
    .filter((t) => rank[states.get(t.id)!] !== undefined)
    .sort((a, b) => rank[states.get(a.id)!]! - rank[states.get(b.id)!]!);
  const waiting = new Set(props.sessions.filter(isWaiting).map((s) => s.ticketId));
  const selId = props.selection?.kind === 'ticket' ? props.selection.id : undefined;
  return (
    <div className="upnext">
      <SectionHeader title="Up next" count={<span className="n mono-label">{items.length}</span>} />
      {!snap && <Empty>Ready tickets show here</Empty>}
      {snap && !items.length && <Empty>Nothing ready</Empty>}
      {snap && items.length > 0 && (
        <ul className="ticket-list">
          {items.map((t) => {
            const st = states.get(t.id)!;
            const row = { state: st, waiting: waiting.has(t.id), assignee: t.assignee, hitl: attention(t) === 'hitl' };
            const stateText = upNextState(row);
            return (
              <li key={t.id} className={`${selId === t.id ? 'sel' : ''} st-${upNextTone(row)}`}>
                <button onClick={() => props.onSelect({ kind: 'ticket', id: t.id })}>
                  <i className="dot" />
                  <span className="key t-code">{t.key}</span>
                  <span className="ttl t-body">{t.title}</span>
                  <span className="st-text t-meta">{stateText}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The quiet state on the right: who has it, "waiting on you" (the only red one), or ready, saying when it needs you. */
function upNextState(t: { state: NodeState; waiting: boolean; assignee?: string; hitl: boolean }) {
  if (t.waiting) return 'waiting on you';
  if (t.state === 'claimed') return t.assignee ?? 'claimed';
  const ready = STATE_TEXT[t.state].toLowerCase();
  return t.hitl ? `${ready}, needs you` : ready;
}

/** The dot, as on the map's cards: green working, grey ready, amber when it's ready but needs a person, red waiting on you. */
function upNextTone(t: { state: NodeState; waiting: boolean; hitl: boolean }) {
  if (t.waiting) return 'waiting';
  if (t.state === 'frontier' && t.hitl) return 'attention';
  return t.state;
}
