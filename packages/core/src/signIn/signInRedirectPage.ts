import { createHash } from 'node:crypto';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The page a browser is opened on to reach a sign-in link: it replaces itself with `link` at once (no history entry
 * of its own), with a meta refresh where scripts don't run. It loads nothing and sends no Referer; its policy allows
 * only its own script.
 */
export function signInRedirectPage(link: string) {
  const script = `location.replace(${JSON.stringify(link).replace(/</g, '\\u003c')});`;
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  const href = escapeHtml(link);
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'">`,
    '<meta name="referrer" content="no-referrer">',
    `<meta http-equiv="refresh" content="0;url=${href}">`,
    '<title>Signing in</title>',
    `<script>${script}</script>`,
    '</head><body></body></html>',
    '',
  ].join('\n');
}
