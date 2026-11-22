import type { ReactNode } from 'react';
import { LearnMore } from './LearnMore';

/**
 * How a section opens: one short sentence saying what it is, the few points someone needs to act, and the rest
 * (how it works, limits, caveats) behind Learn more. Long explanations go in `more`, never in the lead.
 */
export function SectionIntro(props: { lead: ReactNode; points?: ReactNode[]; more?: ReactNode[] }) {
  const points = props.points ?? [];
  const more = props.more ?? [];
  return (
    <div className="sec-intro">
      <p className="vf-intro">{props.lead}</p>
      {points.length > 0 && (
        <ul className="sec-points">
          {points.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      )}
      {more.length > 0 && <LearnMore points={more} />}
    </div>
  );
}
