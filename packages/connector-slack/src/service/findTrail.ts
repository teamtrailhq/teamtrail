/** A trail by its key (`#1`), id or title, ignoring case; the first whose title contains the words otherwise. */
export function findTrail<T extends { id: string; key: string; title: string }>(maps: T[], arg: string) {
  const a = arg.toLowerCase().replace(/^#/, '');
  return (
    maps.find((x) => x.key.toLowerCase().replace(/^#/, '') === a || x.id.toLowerCase() === a) ??
    maps.find((x) => x.title.toLowerCase() === a) ??
    maps.find((x) => x.title.toLowerCase().includes(a))
  );
}
