import type { BriefingStatus } from '../../hooks';

const BRIEFING_TITLE: Record<BriefingStatus, string> = {
  new: 'While you were away: a new trip report from Scout',
  seen: 'Reopen the last trip report',
  none: 'No trip report yet. Scout writes one when you come back after being away.',
};

export interface RecordsProps {
  onStats: () => void;
  knowledge: number;
  onKnowledge: () => void;
  briefingOpen: boolean;
  briefingStatus: BriefingStatus;
  onBriefing: () => void;
}

/** The trip report, the field guide and trail stats, as menu items: in Records, and on a phone in More. */
export function RecordsItems(props: RecordsProps & { close: () => void }) {
  const isNew = props.briefingStatus === 'new';
  const pick = (action: () => void) => () => {
    props.close();
    action();
  };
  return (
    <>
      <button
        role="menuitem"
        className="header-menu-item"
        disabled={props.briefingStatus === 'none' && !props.briefingOpen}
        title={BRIEFING_TITLE[props.briefingStatus]}
        onClick={pick(props.onBriefing)}
      >
        <span>Trip report</span>
        {isNew && <span className="new-dot" aria-label="new" />}
      </button>
      <button
        role="menuitem"
        className="header-menu-item knowledge-btn"
        title="What agents know about this codebase and product. Review suggestions, flags and stale entries"
        onClick={pick(props.onKnowledge)}
      >
        <span>Field guide</span>
        {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
      </button>
      <button
        role="menuitem"
        className="header-menu-item stats-btn"
        title="How your agents deliver across trails, by vendor, agent and ticket type."
        onClick={pick(props.onStats)}
      >
        <span>Trail stats</span>
      </button>
    </>
  );
}
