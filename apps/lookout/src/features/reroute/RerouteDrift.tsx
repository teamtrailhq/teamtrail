import { MetaLine } from '../../components/ui';

/**
 * Above Approve: the tickets that moved on since the proposal was made, and the trail lead's "I've seen this",
 * which Approve waits for.
 */
export function RerouteDrift(props: {
  changed: { key: string; title: string; what: string }[];
  seen: boolean;
  onSeen: (seen: boolean) => void;
}) {
  return (
    <section className="reroute-drift edge-note edge-attention">
      <h3 className="mono-label">Changed since it was proposed</h3>
      <ul className="item-list">
        {props.changed.map((c) => (
          <li key={c.key}>
            <span className="item-text">{c.title}</span>
            <MetaLine parts={[{ text: c.key, code: true }, c.what]} />
          </li>
        ))}
      </ul>
      <label className="reroute-seen t-body">
        <input type="checkbox" checked={props.seen} onChange={(e) => props.onSeen(e.target.checked)} /> I’ve seen what
        changed: apply the proposal to the trail as it is now
      </label>
    </section>
  );
}
