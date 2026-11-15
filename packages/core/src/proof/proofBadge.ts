import type { ProofStatus } from '../model/proof';

/**
 * The badge at the top of a proof in a pull request: a fixed image on the site (GitHub fetches it through its image
 * proxy, so nothing about the project is sent), never a link to a hosted report. Sources in `brand/badges/`.
 */
export function proofBadge(status: ProofStatus): string {
  if (status === 'verified') return '![Teamtrail: verified](https://teamtrail.app/badges/verified.svg)';
  return '![Teamtrail: not verified](https://teamtrail.app/badges/not-verified.svg)';
}
