const REPO = 'teamtrailhq/teamtrail';
const KEY = 'teamtrail.gh-stars';
const MAX_AGE = 60 * 60 * 1000;

/** 1234 → "1.2k", like GitHub's own button. */
function short(n: number) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
}

function cached(): number | undefined {
  try {
    const hit = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { n: number; at: number } | null;
    if (hit && Date.now() - hit.at < MAX_AGE) return hit.n;
  } catch {
    // Storage blocked or bad JSON: fetch again.
  }
  return undefined;
}

async function fetchStars(): Promise<number | undefined> {
  const res = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return undefined;
  const n = ((await res.json()) as { stargazers_count?: number }).stargazers_count;
  if (typeof n !== 'number') return undefined;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ n, at: Date.now() }));
  } catch {
    // Not cached this time; fine.
  }
  return n;
}

/** Shows the repo's star count on the GitHub buttons. If GitHub can't be reached, the button stays as it was. */
export async function initGhStars() {
  const slots = Array.from(document.querySelectorAll<HTMLElement>('[data-gh-stars]'));
  if (!slots.length) return;
  const n = cached() ?? (await fetchStars().catch(() => undefined));
  if (n === undefined) return;
  for (const slot of slots) {
    const count = slot.querySelector('[data-gh-count]');
    if (count) count.textContent = short(n);
    slot.setAttribute('aria-label', `${n} ${n === 1 ? 'star' : 'stars'}`);
    slot.hidden = false;
  }
}
