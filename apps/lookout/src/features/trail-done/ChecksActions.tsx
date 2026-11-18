import { Button } from '../../components/ui';

/** The checks fail on main with every merge: see what fails (and add a fix ticket there), or later. */
export function ChecksActions(props: { onChecks: () => void; onClose: () => void }) {
  return (
    <>
      <Button variant="ghost" onClick={props.onClose}>
        Later
      </Button>
      <Button variant="primary" autoFocus onClick={props.onChecks}>
        See what fails
      </Button>
    </>
  );
}
