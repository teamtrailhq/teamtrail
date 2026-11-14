/** A page of the server in front of the Lookout, shown in Settings → You (lib/managedSignIn.ts). */
export interface ManagedPage {
  label: string;
  href: string;
}

const MAX_PAGES = 8;
const MAX_LABEL = 40;

/** Whether `href` is a page on this very origin: a path, or a full URL of the same origin. Never another site. */
function onOrigin(href: string, origin: string) {
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

/** The pages a `GET /session` reply's `managed.pages` lists, keeping only well-formed ones on this origin. */
export function managedPages(raw: unknown, origin: string): ManagedPage[] {
  if (!Array.isArray(raw)) return [];
  const pages: ManagedPage[] = [];
  for (const p of raw.slice(0, MAX_PAGES)) {
    const { label, href } = (p ?? {}) as { label?: unknown; href?: unknown };
    if (typeof label !== 'string' || typeof href !== 'string') continue;
    const name = label.trim();
    if (!name || name.length > MAX_LABEL || !onOrigin(href, origin)) continue;
    pages.push({ label: name, href });
  }
  return pages;
}
