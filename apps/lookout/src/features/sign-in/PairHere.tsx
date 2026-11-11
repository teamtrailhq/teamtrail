import { BRAND } from '@teamtrail/core';

/** How a browser on the machine the Lookout runs on gets a link: `teamtrail pair`, which opens a tab on one. */
export function PairHere() {
  return (
    <p className="t-body pair-step pair-here">
      On the machine {BRAND.name} runs on, run <code className="t-code">{BRAND.slug} pair</code>: it opens a tab ready
      to sign in, with one click. Or open the Sign in link <code className="t-code">{BRAND.slug}</code> printed in its
      terminal.
    </p>
  );
}
