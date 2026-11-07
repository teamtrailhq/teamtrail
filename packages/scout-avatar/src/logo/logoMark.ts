/**
 * The Teamtrail logo in a 200×200 box: a lowercase t whose stem curves into a path that runs to a connection node,
 * like a trail reaching its destination, in the theme's moss and blaze. `--tt-logo-edge` puts a subtle edge around the tile on dark backgrounds.
 */
export function logoMarkup() {
  return [
    '<rect x="1" y="1" width="198" height="198" rx="44" fill="#17211c" stroke="var(--tt-logo-edge, #17211c)" stroke-width="2"/>',
    '<g transform="translate(32 32) scale(.68)">',
    '<path d="M58 8L104 0V132Q104 150 124 150H150V196H112Q58 196 58 142Z" fill="#8fbf84"/>',
    '<path d="M14 58H150V102H14Z" fill="#8fbf84"/>',
    '<circle cx="182" cy="173" r="23" fill="#e8833a"/>',
    '</g>',
  ].join('');
}

/** The mark with no tile, on transparency, for favicons: a mid moss that reads on light and dark browser tabs. */
export function logoBareMarkup() {
  return [
    '<g transform="translate(-3 2) scale(.98)">',
    '<path d="M58 8L104 0V132Q104 150 124 150H150V196H112Q58 196 58 142Z" fill="#5f9658"/>',
    '<path d="M14 58H150V102H14Z" fill="#5f9658"/>',
    '<circle cx="182" cy="173" r="23" fill="#e8833a"/>',
    '</g>',
  ].join('');
}
