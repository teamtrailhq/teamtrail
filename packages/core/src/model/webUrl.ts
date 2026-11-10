/**
 * A stored or received URL as something safe to put in a link: itself when it is an `http(s)` URL (or one of the
 * `also` schemes a caller names), otherwise undefined. A decision's source, a pull request, a catalog's repo and
 * a sign-in page all come from data, and `javascript:` in an `href` runs in the Lookout's own origin.
 */
export function webUrl(url: string | null | undefined, also: string[] = []): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return ['http:', 'https:', ...also].includes(protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}
