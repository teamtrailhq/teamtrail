import type { LaidOutNode } from '@teamtrail/core';

/**
 * The hatched strip that holds cancelled tickets, under the rest of the map: a rule across the top, the label and
 * how many tickets it holds, so ruled-out work is hard to miss.
 */
export function OutOfScopeStrip(props: { y: number; width: number; height: number; nodes: LaidOutNode[] }) {
  const { y, width, height } = props;
  const count = props.nodes.filter((n) => n.state === 'out-of-scope').length;
  if (!count) return null;
  return (
    <g className="quarantine">
      <rect x={-20} y={y - 30} width={width + 40} height={height + 18} fill="url(#hatch-oos)" />
      <line x1={-20} y1={y - 30} x2={width + 20} y2={y - 30} />
      <text x={-12} y={y - 12}>
        Out of scope · {count}
      </text>
    </g>
  );
}
