import { cx } from '../../lib';
import { MAIN_H, MAIN_W } from './mainSpot';
import type { MainTone } from './types';

/**
 * Checks on main at the start of the trail: a small `main` card the trail's first tickets branch from. Red, with the
 * breathing halo, when the human has to choose how the trail goes on; amber when held up; a check when they pass.
 * Clicking it opens its bubble.
 */
export function MainMark(props: {
  x: number;
  y: number;
  edges: string[];
  tone: MainTone;
  selected: boolean;
  onSelect: () => void;
}) {
  const { tone } = props;
  const passed = tone === 'passed';
  return (
    <>
      {props.edges.map((d) => (
        <path key={d} className={cx('edge', passed ? 'edge-done' : 'edge-open')} d={d} />
      ))}
      <g
        className={cx('node main-mark', `main-${tone}`, tone === 'needs' && 'waiting', props.selected && 'sel')}
        transform={`translate(${props.x} ${props.y})`}
        role="button"
        tabIndex={0}
        aria-label="Checks on main"
        onClick={(e) => {
          e.stopPropagation();
          props.onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') props.onSelect();
        }}
      >
        <rect className="ring" x={-3.5} y={-3.5} width={MAIN_W + 7} height={MAIN_H + 7} rx={8} />
        <rect className="card" x={0.5} y={0.5} width={MAIN_W - 1} height={MAIN_H - 1} rx={5} />
        {passed ? (
          <path className="dot dot-done dot-verified" d="M8 13l2.5 2.5 4.5 -5" />
        ) : (
          <circle className={cx('dot', `main-dot-${tone}`)} cx={11} cy={13} r={3.5} />
        )}
        <text className="main-label" x={20} y={17}>
          main
        </text>
      </g>
    </>
  );
}
