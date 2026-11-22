import type { ReactNode } from 'react';
import { Disclosure } from '../../components/ui';

/** What a section's reader can skip: how it works, its limits and caveats, as short points one click away. */
export function LearnMore(props: { points: ReactNode[] }) {
  return (
    <Disclosure label="Learn more" hideLabel="Show less">
      <ul className="sec-more">
        {props.points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </Disclosure>
  );
}
