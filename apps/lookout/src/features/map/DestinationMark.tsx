/**
 * The small, bold hand-drawn X that marks the spot: where the trail ends. No label on the map; hovering or focusing
 * it says what the destination is.
 */
export function DestinationMark({ x, y, text }: { x: number; y: number; text?: string }) {
  const tip = text?.trim() ? `Destination\n${text.trim()}` : 'Destination\nWhere this trail ends';
  return (
    <g className="destination" transform={`translate(${x} ${y})`} aria-label={tip} data-tip={tip} tabIndex={0}>
      <rect className="x-hit" x={-24} y={-24} width={48} height={48} />
      <path className="x-stroke" d="M-15 -16 C-9 -10 2 4 16 17" />
      <path className="x-stroke" d="M17 -15 C8 -8 -6 5 -16 17" />
    </g>
  );
}
