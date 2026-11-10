/** The small, bold hand-drawn X that marks the spot: where the trail ends. */
export function DestinationMark({ x, y }: { x: number; y: number }) {
  return (
    <g className="destination" transform={`translate(${x} ${y})`} aria-label="Destination">
      <path className="x-stroke" d="M-15 -16 C-9 -10 2 4 16 17" />
      <path className="x-stroke" d="M17 -15 C8 -8 -6 5 -16 17" />
      <text y={40} textAnchor="middle">
        Destination
      </text>
    </g>
  );
}
