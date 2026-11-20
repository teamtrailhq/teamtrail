/** Patterns shared by the graph: the map's dot grid and the out-of-scope hatch. */
export function GraphDefs() {
  return (
    <defs>
      <pattern id="map-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="var(--map-grid)" />
      </pattern>
      <pattern id="hatch-oos" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke="var(--line2)" strokeWidth="1" />
      </pattern>
    </defs>
  );
}
