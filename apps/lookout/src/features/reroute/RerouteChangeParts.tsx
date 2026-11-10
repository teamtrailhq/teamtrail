import type { ChangePart } from './rerouteText';

/** Under a change's row: what approving it writes, word for word, so nothing is applied that wasn't shown. */
export function RerouteChangeParts({ parts }: { parts: ChangePart[] }) {
  return (
    <dl className="reroute-parts">
      {parts.map((p) => (
        <div key={p.label}>
          <dt className="t-label">{p.label}</dt>
          <dd className="t-body">{p.text}</dd>
        </div>
      ))}
    </dl>
  );
}
