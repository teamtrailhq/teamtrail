import { Disclosure } from '../../components/ui';

/** Why a proof isn't verified, in one line: the first gap, the rest behind a disclosure. */
export function ProofGapsLine(props: { gaps: string[] }) {
  const [first, ...rest] = props.gaps;
  return (
    <div className="merge-gaps">
      <span className="t-meta">Not verified: {first ?? 'no passing completion.'}</span>
      {rest.length > 0 && (
        <Disclosure label={`${rest.length} more`}>
          <ul className="proof-gaps t-meta">
            {rest.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
