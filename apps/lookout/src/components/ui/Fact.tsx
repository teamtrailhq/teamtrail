import type { ReactNode } from 'react';

/** One labelled fact in a `dl.facts` list: a small caps label and its value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt className="t-label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
