/** Patterns shared by the graph: the map grid and the out-of-scope hatch. */
export function GraphDefs() {
  return (
    <defs>
      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="var(--map-grid)" strokeWidth="1" />
      </pattern>
      <pattern id="hatch-oos" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke="var(--line)" strokeWidth="1" />
      </pattern>
    </defs>
  );
}
