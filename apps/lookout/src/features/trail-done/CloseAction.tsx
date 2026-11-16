import { Button } from '../../components/ui';

/** Nothing is left: the dialog only closes. */
export function CloseAction({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="primary" autoFocus onClick={onClose}>
      Close
    </Button>
  );
}
