/**
 * The one-time link that signs a browser in to the Lookout at `base` (`http://localhost:7420/`): the Lookout's own
 * page, maybe on `next` (`?settings=slack`), with the code in the fragment (`#pair=…`). A fragment never reaches a
 * server, a log or a Referer; the page reads it, takes it out of the address bar and pairs on a click.
 */
export function pairLink(base: string, code: string, next = '') {
  return `${base.replace(/\/?$/, '/')}${next}#pair=${code}`;
}
