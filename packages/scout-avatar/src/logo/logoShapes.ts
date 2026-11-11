/**
 * The mark's shapes in its 200×200 box: a lowercase t whose stem curves into a path, a gap, then the destination dot.
 * `mark` and `dot` are the attributes that colour them (`fill="…"` or `class="…"`).
 */
export function logoShapes({ mark, dot }: { mark: string; dot: string }) {
  return [
    `<path d="M58 8L104 0V132Q104 150 124 150H140V196H112Q58 196 58 142Z" ${mark}/>`,
    `<path d="M14 58H150V102H14Z" ${mark}/>`,
    `<circle cx="177" cy="173" r="28" ${dot}/>`,
  ].join('');
}
