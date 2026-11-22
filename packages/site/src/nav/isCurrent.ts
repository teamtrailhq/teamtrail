/**
 * Whether a nav link is the page you're on, or a page under it: `/docs/` for `/docs/cli/`. Links to a section of a
 * page (`/#how`) and to the home page never are, since every page is under it.
 */
export function isCurrent(link: string, path: string | undefined) {
  if (!path || link.includes('#') || link === '/') return false;
  const here = path.replace(/index\.html$/, '');
  return here === link || here.startsWith(link);
}
