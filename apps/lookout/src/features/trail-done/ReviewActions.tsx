import { Button } from '../../components/ui';

/** Open pull requests are left: review them now, or later. */
export function ReviewActions(props: { pulls: number; onReview: () => void; onClose: () => void }) {
  const label = props.pulls === 1 ? 'Review pull request' : 'Review pull requests';
  return (
    <>
      <Button variant="ghost" onClick={props.onClose}>
        Later
      </Button>
      <Button variant="primary" autoFocus onClick={props.onReview}>
        {label}
      </Button>
    </>
  );
}
