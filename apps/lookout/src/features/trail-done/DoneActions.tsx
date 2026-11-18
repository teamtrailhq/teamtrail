import type { TrailDone } from '@teamtrail/core';
import { ChecksActions } from './ChecksActions';
import { CloseAction } from './CloseAction';
import { ReviewActions } from './ReviewActions';

/** What's left, as the dialog's actions: checks failing on main together first, then open pull requests. */
export function DoneActions(props: {
  done: Exclude<TrailDone, { kind: 'not-done' }>;
  pulls: number;
  onReview: () => void;
  onChecks: () => void;
  onClose: () => void;
}) {
  if (props.done.kind === 'unverified' && props.done.together.kind === 'failed')
    return <ChecksActions onChecks={props.onChecks} onClose={props.onClose} />;
  if (props.pulls > 0) return <ReviewActions pulls={props.pulls} onReview={props.onReview} onClose={props.onClose} />;
  return <CloseAction onClose={props.onClose} />;
}
