import { Clamp, MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import type { HistoryEntry } from './historyEntries';

/** One decision or comment: who, what kind and when, then its words (as markdown); a decision opens in the Logbook. */
export function HistoryItem(props: { entry: HistoryEntry; onOpenDecision?: (id: string) => void }) {
  const e = props.entry;
  const open = e.decision && props.onOpenDecision;
  return (
    <li className="history-item">
      <MetaLine parts={[{ text: e.who, strong: true }, e.kind, hhmm(e.at)]}>
        {open && (
          <button type="button" className="d-more" onClick={() => props.onOpenDecision?.(e.decision!)}>
            {e.decision} ›
          </button>
        )}
      </MetaLine>
      <Clamp text={e.text} markdown />
    </li>
  );
}
