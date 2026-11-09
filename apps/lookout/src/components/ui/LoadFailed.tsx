import { Button } from './Button';
import { MetaLine } from './MetaLine';

/** A lookup that failed: what didn't load, a short reason, and Retry. */
export function LoadFailed(props: { what: string; reason?: string; onRetry: () => void }) {
  return (
    <div className="ds-load-failed" role="alert">
      <MetaLine parts={[props.what, props.reason]} />
      <Button size="sm" variant="ghost" onClick={props.onRetry}>
        Retry
      </Button>
    </div>
  );
}
