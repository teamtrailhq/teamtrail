import { BRAND } from '@teamtrail/core';

/** How a browser on the machine the Lookout runs on gets a link: `teamtrail pair`. */
export function PairHere() {
  return (
    <p className="t-body pair-step pair-here">
      On the machine {BRAND.name} runs on, open the Sign in link <code className="t-code">{BRAND.slug}</code> printed in
      its terminal, or run <code className="t-code">{BRAND.slug} pair</code> for a new one.
    </p>
  );
}
