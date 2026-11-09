/** The last stretches of trail, thin connectors like the rest, leading to the X. */
export function DestinationTrail({ trails }: { trails: string[] }) {
  return trails.map((d) => <path key={d} className="edge edge-open edge-destination" d={d} />);
}
