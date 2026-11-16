import { useEffect } from 'react';
import { Button, Panel } from '../../components/ui';

/** Discovery is over: the trail lead reviews the brief before any implementation ticket can be claimed. */
export function BriefReadyDialog({ onReview, onClose }: { onReview: () => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <Panel
        as="div"
        className="dialog brief-ready"
        role="dialog"
        aria-label="Research is done"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 className="t-heading caps">Research is done</h2>
        </header>
        <p className="t-body">The discovery brief needs your review. Implementation starts once you accept it.</p>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button variant="primary" autoFocus onClick={onReview}>
            Review brief
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
