import type { GapStanding } from '@teamtrail/core';
import { Disclosure } from '../../components/ui';

/** The first gap in words, with who is on it when the plan says. */
const line = (text: string, g?: GapStanding) => (g?.status ? `${text} ${g.status}` : text);

/**
 * Why a proof isn't verified, in one line: the first gap and who is on it, the rest behind a disclosure. The action
 * that closes the first one that is the human's is the bar's primary button (useTicketActions).
 */
export function ProofGapsLine(props: { gaps: string[]; plan?: GapStanding[] }) {
  const [first, ...rest] = props.gaps;
  const standing = props.plan?.find((g) => g.text === first);
  return (
    <div className="merge-gaps">
      <span className="t-meta">Not verified: {first ? line(first, standing) : 'no passing completion.'}</span>
      {rest.length > 0 && (
        <Disclosure label={`${rest.length} more`}>
          <ul className="proof-gaps t-meta">
            {rest.map((g) => (
              <li key={g}>
                {line(
                  g,
                  props.plan?.find((p) => p.text === g),
                )}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
