import type { TrailDone } from '@teamtrail/core';
import { useEffect } from 'react';
import { Panel } from '../../components/ui';
import { DestinationMarkArt } from './DestinationMarkArt';
import { DoneActions } from './DoneActions';

type Reached = Exclude<TrailDone, { kind: 'not-done' }>;

const pullsText = (n: number) => (n === 1 ? '1 pull request to merge.' : `${n} pull requests to merge.`);

/**
 * The trail reached its destination: shown once per trail, with whether it was verified together on main. Its primary
 * action leads to what's left: the checks failing on main with every merge (the destination's bubble), the open pull
 * requests (each done ticket's Proof section, where a server that merges offers Approve and merge), else it closes.
 */
export function TrailDoneDialog(props: {
  done: Reached;
  pulls: number;
  onReview: () => void;
  onChecks: () => void;
  onClose: () => void;
}) {
  const { done, pulls, onClose } = props;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <Panel
        as="div"
        className={`dialog trail-done ${done.kind}`}
        role="dialog"
        aria-label="Destination reached"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <DestinationMarkArt done={done} size={22} />
          <h2 className="t-heading caps">Destination reached</h2>
        </header>
        <p className="t-body">
          {done.reason}.{pulls > 0 && ` ${pullsText(pulls)}`}
        </p>
        <footer>
          <DoneActions {...props} />
        </footer>
      </Panel>
    </div>
  );
}
