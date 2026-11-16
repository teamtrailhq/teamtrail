/** The last stretches of trail, thin connectors like the rest, leading to the X; walked once the trail is done. */
export function DestinationTrail({ trails, travelled }: { trails: string[]; travelled?: boolean }) {
  const cls = travelled ? 'edge edge-done edge-travelled edge-destination' : 'edge edge-open edge-destination';
  return trails.map((d) => <path key={d} className={cls} d={d} />);
}
