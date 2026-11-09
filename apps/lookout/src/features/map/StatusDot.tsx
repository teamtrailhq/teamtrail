import type { NodeTone } from './nodeTone';

/** The status dot at the start of a card's title line: a check once the ticket is done, a ring in the backlog. */
export function StatusDot({ tone, cy }: { tone: NodeTone; cy: number }) {
  if (tone === 'done') {
    return <path className="dot dot-done" d={`M10 ${cy}l2.5 2.5 4.5 -5`} />;
  }
  return <circle className={`dot dot-${tone}`} cx={13} cy={cy} r={tone === 'backlog' ? 3 : 3.5} />;
}
