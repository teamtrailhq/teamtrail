const TRIES = 20;

/** Brings the inspector's Proof section into view once it has loaded for the ticket just opened. */
export function scrollToProof(tries = TRIES) {
  const el = document.querySelector('.ticket-proof');
  if (el) return el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (tries > 0) setTimeout(() => scrollToProof(tries - 1), 100);
}
