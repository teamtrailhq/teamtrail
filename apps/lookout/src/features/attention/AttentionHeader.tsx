import type { AttentionView, FocusChange } from '@teamtrail/core';
import { FocusControl } from './FocusControl';

/** Header: whether focus is on, and what it holds back. How much needs you is the header's own "N need you". */
export function AttentionHeader(props: {
  view: AttentionView;
  onFocus: (change: FocusChange) => void;
  onSettings: () => void;
}) {
  return (
    <span className="attention-head">
      <FocusControl view={props.view} onChange={props.onFocus} onSettings={props.onSettings} />
    </span>
  );
}
