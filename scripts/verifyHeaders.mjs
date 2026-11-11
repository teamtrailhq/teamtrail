// The Lookout's own headers in a real browser: the page loads under its Content-Security-Policy with no
// violation in any Settings group, API answers are never cached or framed, and another site can't frame it.
import { sessionHeaders, signInWith } from './e2eHelpers.mjs';

/** Every Settings group, opened by its link, as a person would. */
const GROUPS = ['trail', 'project', 'alerts', 'you', 'projects', 'about', 'remote-agents', 'slack', 'guides'];

export async function verifyHeaders({ browser, url, log, pair }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // a browser of its own: signed in with a new link from `teamtrail pair`
  await signInWith(page, pair());
  const violations = [];
  page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`Refused to load: CSP ${e.violatedDirective} ${e.blockedURI}`),
    ),
  );
  const first = await page.goto(url);
  const h = first.headers();
  const pageOk =
    /frame-ancestors 'none'/.test(h['content-security-policy'] ?? '') &&
    /script-src 'self'/.test(h['content-security-policy'] ?? '') &&
    h['x-frame-options'] === 'DENY' &&
    h['x-content-type-options'] === 'nosniff' &&
    h['referrer-policy'] === 'no-referrer';
  await page.locator('#root > *').first().waitFor();
  for (const g of GROUPS) {
    await page.goto(`${url}?settings=${g}`);
    await page.waitForTimeout(400);
  }
  const api = await page.request.get(`${url}__teamtrail/list`, { headers: await sessionHeaders(page) });
  const a = api.headers();
  const apiOk =
    a['cache-control'] === 'no-store' &&
    a['x-frame-options'] === 'DENY' &&
    /default-src 'none'/.test(a['content-security-policy'] ?? '');

  // Another origin (localhost vs 127.0.0.1) frames the Lookout: the browser must refuse to show it.
  const other = url.includes('localhost')
    ? url.replace('localhost', '127.0.0.1')
    : url.replace('127.0.0.1', 'localhost');
  const attacker = await browser.newPage();
  await attacker.route(`${other}framer`, (r) =>
    r.fulfill({ contentType: 'text/html', body: `<iframe id="f" src="${url}?settings=project"></iframe>` }),
  );
  await attacker.goto(`${other}framer`);
  await attacker.waitForTimeout(800);
  const framed = attacker.frames().find((f) => f !== attacker.mainFrame());
  const framedText = framed ? await framed.evaluate(() => document.body?.innerText ?? '').catch(() => '') : '';
  const frameRefused = !/Settings|Lookout|Remote agents/.test(framedText);
  await attacker.close();
  await page.close();
  const ok = pageOk && apiOk && frameRefused && violations.length === 0;
  log(
    `security headers ${ok ? 'ok' : 'WRONG'}: page CSP ${pageOk ? 'sent' : 'MISSING'}, ${violations.length} CSP violation(s) across ${GROUPS.length} Settings groups${violations.length ? `: ${violations.join(' | ')}` : ''}; API ${apiOk ? 'no-store, never framed' : 'headers MISSING'}; framed by another origin: ${frameRefused ? 'refused' : 'SHOWN'}`,
  );
  return ok;
}
