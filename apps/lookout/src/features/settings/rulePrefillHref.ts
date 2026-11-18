/** The address with a suggested rule for the Rules editor: `when` as comma-separated globs, and `why`. */
export function rulePrefillHref(href: string, rule: { when: string[]; why: string }) {
  const url = new URL(href);
  url.searchParams.set('when', rule.when.join(','));
  url.searchParams.set('why', rule.why);
  return url.toString();
}
