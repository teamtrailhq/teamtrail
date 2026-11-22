import { cx } from '../../lib';
import { ChangedLine } from './ChangedLine';
import { diffLine } from './diffLine';

/**
 * What approving covers, in mono: as a diff (removed lines struck through, added ones marked with a bar, a changed
 * value's old one struck through before the new), or, for
 * content nobody committed, the text whole and as it is.
 */
export function ApprovalLines(props: { lines: string[]; whole: boolean }) {
  if (props.whole) return <pre className="ap-lines t-code">{props.lines.join('\n')}</pre>;
  return (
    <div className="ap-lines ap-diff" role="list">
      {props.lines.map((l, i) => {
        const d = diffLine(l);
        return (
          <div key={i} role="listitem" className={cx('ap-dl', `ap-${d.kind}`)}>
            <span className="ap-g" aria-hidden="true">
              {d.gutter}
            </span>
            <span className="ap-t">
              {d.kind === 'add' && <span className="ap-sr">Added: </span>}
              {d.kind === 'rm' && <span className="ap-sr">Removed: </span>}
              {d.kind === 'change' ? <ChangedLine text={d.text} /> : d.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
