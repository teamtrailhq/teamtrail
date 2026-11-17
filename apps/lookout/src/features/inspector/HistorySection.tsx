import type { DecisionRecord, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { DetailSection } from '../../components/ui';
import { useSlackPeople } from '../slack';
import { historyEntries } from './historyEntries';
import { HistoryItem } from './HistoryItem';

/** The ticket's decisions and comments, newest first: the latest at a glance, the rest behind "Show all". */
export function HistorySection(props: {
  t: Ticket;
  decisions: DecisionRecord[];
  onOpenDecision?: (id: string) => void;
}) {
  const people = useSlackPeople();
  const [all, setAll] = useState(false);
  const entries = historyEntries({ comments: props.t.comments, decisions: props.decisions, people });
  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, 1);
  return (
    <DetailSection label="History" className="ticket-history">
      <ul className="history">
        {shown.map((e) => (
          <HistoryItem key={e.id} entry={e} onOpenDecision={props.onOpenDecision} />
        ))}
      </ul>
      {entries.length > 1 && (
        <button type="button" className="d-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show the latest only' : `Show all ${entries.length}`}
        </button>
      )}
    </DetailSection>
  );
}
