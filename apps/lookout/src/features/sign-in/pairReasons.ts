import { BRAND } from '@teamtrail/core';

/** Why the pairing page opened again after a link (`?pair=…`, set by the server's redirect). */
export const PAIR_REASONS: Record<string, string> = {
  used: `That link was already used or has expired. Run ${BRAND.slug} pair for a new one.`,
  wait: 'Too many wrong codes. Wait a minute, then try again.',
};

export const AMBIGUOUS_COOKIES =
  'This browser sends two sign-in cookies for this Lookout (another app on localhost may have set one). Clear this site’s data in the browser, then pair again.';
