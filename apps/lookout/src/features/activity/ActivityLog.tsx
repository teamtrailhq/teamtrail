import type { ActivityState } from '@teamtrail/core';
import { EmptyState } from '../../components/ui';
import { actorLabel, clock } from '../../lib';
import { useSlackPeople } from '../slack';
import { feedEdge } from './feedEdge';

/**
 * Dense activity log: time, who, message. One line per event in one text style; the full message shows on hover. A
 * left bar (`feedEdge`) is the only mark of importance: red needs you now, green went well, amber held up.
 */
export function ActivityLog({ activity, onTicket }: { activity: ActivityState; onTicket: (id: string) => void }) {
  const people = useSlackPeople();
  const rows = activity.feed.slice(-120).reverse();
  if (!rows.length)
    return (
      <EmptyState
        title="Nothing has happened yet"
        hint="Claims, steps, questions and decisions appear here as agents work."
      />
    );
  return (
    <div className="log">
      {rows.map((e) => (
        <div
          key={e.id}
          className={`log-row src-${e.source.replace(' ', '-')} edge-${feedEdge(e) ?? 'none'}`}
          onClick={() => e.ticketId && onTicket(e.ticketId)}
        >
          <span className="t t-meta">{clock(e.at)}</span>
          <span className="src t-meta">{actorLabel(e.agent ?? e.source, people)}</span>
          <span className="msg" title={e.tag ? `${e.tag} · ${e.text}` : e.text}>
            {e.tag && <span className="tag t-meta">{e.tag} · </span>}
            {e.text}
          </span>
        </div>
      ))}
    </div>
  );
}
