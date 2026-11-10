import type { ServerResponse } from 'node:http';

/**
 * The Lookout's own page: its scripts, styles, fonts and API from this origin only (images and fonts may also
 * be `data:` URLs, as the favicon is), no plugins, no `<base>`, and never inside another site's frame. Checked
 * against the built Lookout in a real browser with no violations (scripts/verifyHeaders.mjs).
 */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** An API answer is data, never a page: nothing in it may load, run or be framed. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/**
 * Headers every answer of a Teamtrail server carries. A page on another site can't frame the Lookout to get
 * same-origin clicks on Approve or Create token (`frame-ancestors`, X-Frame-Options), no answer is read as
 * another type than it says (nosniff), and no URL leaks to another site in a Referer. `kind: 'api'` answers
 * are also never cached; the page's own caching (immutable assets) is set where it is served.
 */
export function setSecurityHeaders(res: ServerResponse, kind: 'page' | 'api') {
  if (res.headersSent) return;
  res.setHeader('Content-Security-Policy', kind === 'page' ? PAGE_CSP : API_CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (kind === 'api') res.setHeader('Cache-Control', 'no-store');
}
