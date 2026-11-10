import { Button } from './Button';

/**
 * Above an approve button: the item changed since the human opened it (an agent rewrote it while they read). The
 * approval waits until they take the new version with "Review again".
 */
export function ChangedNotice({ what, onReviewAgain }: { what: string; onReviewAgain: () => void }) {
  return (
    <div className="changed-notice edge-note edge-attention">
      <p className="t-meta">{what} changed since you opened it: read it again before you approve it.</p>
      <Button size="sm" onClick={onReviewAgain}>
        Review again
      </Button>
    </div>
  );
}
