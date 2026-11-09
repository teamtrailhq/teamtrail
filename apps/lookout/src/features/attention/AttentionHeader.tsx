import type { AttentionView, FocusChange } from '@teamtrail/core';
import { ScoutMark } from '../../components/ui';
import { FocusControl } from './FocusControl';

/** Header: whether focus is on (and what it holds back), and how many items interrupt right now. */
export function AttentionHeader(props: {
  view: AttentionView;
  onFocus: (change: FocusChange) => void;
  onSettings: () => void;
}) {
  const { view } = props;
  const n = view.interrupting.length;
  return (
    <span className="attention-head">
      <FocusControl view={view} onChange={props.onFocus} onSettings={props.onSettings} />
      {n > 0 && (
        <span className="waiting-chip interrupting" title={`${n} need you now`}>
          <ScoutMark variant="alert" size={14} />
          <b>{n}</b>
          <span className="wl">&nbsp;need you now</span>
        </span>
      )}
    </span>
  );
}
