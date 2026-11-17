import type { MainCheckResult } from '@teamtrail/core';
import { Disclosure } from '../../components/ui';

/** The end of each failing check's output on main, one click away. */
export function MainCheckOutput(props: { checks: MainCheckResult[] }) {
  return (
    <Disclosure label="Output">
      {props.checks.map((c) => (
        <figure key={c.name} className="main-check-output">
          <figcaption className="t-meta">
            <span className="t-code">{c.argv.join(' ')}</span> · exit {c.exitCode ?? 'none'}
          </figcaption>
          <pre className="t-code">{c.tail}</pre>
        </figure>
      ))}
    </Disclosure>
  );
}
