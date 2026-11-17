import type { BriefingStatus } from '../../hooks';
import { HeaderMenu } from './HeaderMenu';

const BRIEFING_TITLE: Record<BriefingStatus, string> = {
  new: 'While you were away: a new trip report from Scout',
  seen: 'Reopen the last trip report',
  none: 'No trip report yet. Scout writes one when you come back after being away.',
};

/** The views you open now and then, grouped behind one header button: the trip report, the field guide and trail stats. */
export function RecordsMenu(props: {
  onStats: () => void;
  knowledge: number;
  onKnowledge: () => void;
  briefingOpen: boolean;
  briefingStatus: BriefingStatus;
  onBriefing: () => void;
}) {
  const isNew = props.briefingStatus === 'new';
  return (
    <HeaderMenu
      label="Records"
      badge={
        <>
          {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
          {isNew && <span className="new-dot" aria-label="new trip report" />}
        </>
      }
    >
      {(close) => (
        <>
          <button
            role="menuitem"
            className="header-menu-item"
            disabled={props.briefingStatus === 'none' && !props.briefingOpen}
            title={BRIEFING_TITLE[props.briefingStatus]}
            onClick={() => {
              close();
              props.onBriefing();
            }}
          >
            <span>Trip report</span>
            {isNew && <span className="new-dot" aria-label="new" />}
          </button>
          <button
            role="menuitem"
            className="header-menu-item knowledge-btn"
            title="What agents know about this codebase and product. Review suggestions, flags and stale entries"
            onClick={() => {
              close();
              props.onKnowledge();
            }}
          >
            <span>Field guide</span>
            {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
          </button>
          <button
            role="menuitem"
            className="header-menu-item stats-btn"
            title="How your agents deliver across trails, by vendor, agent and ticket type."
            onClick={() => {
              close();
              props.onStats();
            }}
          >
            <span>Trail stats</span>
          </button>
        </>
      )}
    </HeaderMenu>
  );
}
