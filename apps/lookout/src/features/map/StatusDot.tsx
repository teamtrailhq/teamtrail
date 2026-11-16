import type { NodeTone } from './nodeTone';

/**
 * The status dot at the start of a card's title line: a check once the ticket is done (green when its proof is
 * verified, grey when it closed without a passing completion), a ring in the backlog.
 */
export function StatusDot({ tone, cy, verified }: { tone: NodeTone; cy: number; verified?: boolean }) {
  if (tone === 'done') {
    return <path className={`dot dot-done${verified ? ' dot-verified' : ''}`} d={`M10 ${cy}l2.5 2.5 4.5 -5`} />;
  }
  return <circle className={`dot dot-${tone}`} cx={13} cy={cy} r={tone === 'backlog' ? 3 : 3.5} />;
}
