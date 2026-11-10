import { useState } from 'react';
import { Button, ChangedNotice } from '../../components/ui';
import { useShown } from '../../hooks/useShown';

/**
 * The trail lead's confirm of a ticket's criteria, bound to the version they opened: criteria rewritten while they
 * read wait for "Review again", and a refused confirm says why. Taking a confirmation back needs no binding.
 */
export function ConfirmCriteria(props: {
  ticketId: string;
  hash?: string;
  confirmed: boolean;
  confirm: (confirmed: boolean, hash?: string) => Promise<string | undefined>;
}) {
  const shown = useShown(props.ticketId, props.hash);
  const [error, setError] = useState<string>();
  const label = props.confirmed ? 'Unconfirm' : 'Confirm criteria';
  const tip = props.confirmed ? 'Take your confirmation back' : 'Agree that these criteria define done for this ticket';
  const blocked = shown.changed && !props.confirmed;
  return (
    <>
      {shown.changed && <ChangedNotice what="These criteria" onReviewAgain={shown.reviewAgain} />}
      <Button
        size="sm"
        variant={props.confirmed ? 'ghost' : 'default'}
        disabled={blocked}
        data-tip={tip}
        onClick={() => void props.confirm(!props.confirmed, shown.hash).then(setError)}
      >
        {label}
      </Button>
      {error && <p className="vf-err">{error}</p>}
    </>
  );
}
