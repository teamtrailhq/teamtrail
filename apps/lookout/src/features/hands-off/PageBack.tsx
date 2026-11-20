import { Button } from '../../components/ui';

/**
 * Hands-off has no bar of views: while a page covers its home (Activity from a question's "The whole conversation",
 * Plan), Back in the header returns to it, as the browser's Back does. A phone shows the arrow alone, so the header
 * keeps one row.
 */
export function PageBack({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" className="page-back" aria-label="Back" onClick={onBack}>
      ←<span className="page-back-word"> Back</span>
    </Button>
  );
}
