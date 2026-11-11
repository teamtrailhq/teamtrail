import { signInShortId, type StoredSignIn } from '@teamtrail/core';

/**
 * The terminal line for a browser that signed in through the page `teamtrail` or `teamtrail pair` opened, or
 * undefined for any other pairing. Anything that can read the config dir can read that page, so a pairing the human
 * didn't make must show. The browser's name comes from its User-Agent, which anyone can fake: the time, and the short
 * id Settings → Browsers & devices shows beside the entry, are what to check.
 */
export function openedPageNotice(session: StoredSignIn, timeOf = (t: number) => new Date(t).toLocaleTimeString()) {
  if (session.via !== 'opened-page') return undefined;
  return (
    `  Signed in a browser (opened page) at ${timeOf(session.pairedAt)}: ${session.name} · ${signInShortId(session.id)}. ` +
    `Not you? Revoke it in Settings → Browsers & devices.\n`
  );
}
