import { BRAND } from '@teamtrail/core';

/** How a browser on the machine the Lookout runs on gets a link: `teamtrail pair`. */
export function PairHere() {
  return (
    <p className="t-body pair-step pair-here">
      On the machine {BRAND.name} runs on, run <code className="t-code">{BRAND.slug} pair</code> and open the link it
      prints. Starting <code className="t-code">{BRAND.slug}</code> prints one too, and opens it.
    </p>
  );
}
