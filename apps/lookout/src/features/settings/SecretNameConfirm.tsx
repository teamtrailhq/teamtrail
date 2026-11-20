import { Button } from '../../components/ui';
import type { PendingSecret } from './useCheckVariables';

/**
 * Asked before checks may read a name that reads like a credential: what that exposes, then the person's call. Never
 * a value: it still comes only from the shell that started Teamtrail.
 */
export function SecretNameConfirm(props: { pending: PendingSecret; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="cv-confirm" role="alert">
      <p className="t-body">
        <span className="t-code">{props.pending.name}</span> reads like a credential. Any code your checks run can read
        it, and agents write that code. Export a test value only, never a production one.
      </p>
      <div className="cv-confirm-actions">
        <Button size="sm" variant="primary" onClick={props.onConfirm}>
          Let checks read it
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
