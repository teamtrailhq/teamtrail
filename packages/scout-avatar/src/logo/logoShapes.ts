/**
 * The mark's shapes in its 200×200 box (they fill x 14–196, y 0–196): a lowercase t whose stem curves into a path
 * that runs to a block cursor, the wordmark's own. `mark` and `cursor` are the attributes that colour them
 * (`fill="…"` or `class="…"`).
 */
export function logoShapes({ mark, cursor }: { mark: string; cursor: string }) {
  return [
    `<path d="M58 8L104 0V132Q104 150 124 150H140V196H112Q58 196 58 142Z" ${mark}/>`,
    `<path d="M14 58H140V102H14Z" ${mark}/>`,
    `<rect x="154" y="110" width="42" height="86" ${cursor}/>`,
  ].join('');
}
