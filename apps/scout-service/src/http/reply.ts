import type { ServerResponse } from 'node:http';

/** Headers on every answer: https only, nothing cached, no referrer, no sniffing. The service sets no cookies. */
const COMMON = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

/** Pages (install results) run no script and load nothing. */
const PAGE = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** How the service answers: JSON, a plain page, a redirect or nothing. */
export const reply = {
  json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { ...COMMON, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  },
  empty(res: ServerResponse, status = 200) {
    res.writeHead(status, COMMON);
    res.end();
  },
  page(res: ServerResponse, status: number, o: { title: string; text: string }) {
    res.writeHead(status, { ...COMMON, ...PAGE, 'Content-Type': 'text/html; charset=utf-8' });
    const title = escapeHtml(o.title);
    const style = 'font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5';
    res.end(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>` +
        `<body style="${style}"><h1>${title}</h1><p>${escapeHtml(o.text)}</p></body>`,
    );
  },
  redirect(res: ServerResponse, location: string, status: 302 | 303 = 303) {
    res.writeHead(status, { ...COMMON, ...PAGE, Location: location });
    res.end();
  },
};
