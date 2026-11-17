import type { NodeTone } from './nodeTone';

/**
 * The status dot at the start of a card's title line: a check once the ticket is done (green when its proof is
 * verified, grey when it closed without a passing completion), a ring in the backlog. Waiting for an agent to pick it
 * up, a turning arc in its place; an agent at work, the dot pulses.
 */
export function StatusDot(props: { tone: NodeTone; cy: number; verified?: boolean; spin?: boolean; pulse?: boolean }) {
  const { tone, cy } = props;
  if (tone === 'done') {
    return <path className={`dot dot-done${props.verified ? ' dot-verified' : ''}`} d={`M10 ${cy}l2.5 2.5 4.5 -5`} />;
  }
  if (props.spin) return <circle className="dot dot-spin" cx={13} cy={cy} r={4.5} />;
  const dot = <circle className={`dot dot-${tone}`} cx={13} cy={cy} r={tone === 'backlog' ? 3 : 3.5} />;
  if (!props.pulse) return dot;
  return (
    <>
      <circle className="dot-pulse" cx={13} cy={cy} r={3.5} />
      {dot}
    </>
  );
}
