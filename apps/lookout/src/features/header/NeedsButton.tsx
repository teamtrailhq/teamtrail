import { Button } from '../../components/ui';

/** "3 need you": everything waiting on you, across your trails; a click opens the most urgent. Gone when nothing does. */
export function NeedsButton(props: { count: number; top?: string; onOpen: () => void }) {
  if (!props.count) return null;
  return (
    <Button
      variant="urgent"
      className="needs-btn"
      data-tip={props.top && `Most urgent: ${props.top}`}
      onClick={props.onOpen}
    >
      {props.count} need{props.count === 1 ? 's' : ''} you
    </Button>
  );
}
