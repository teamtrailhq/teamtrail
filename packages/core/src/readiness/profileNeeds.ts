import type { Need, RepoProfile } from '../model/repoProfile';

type NeedOf<K extends Need['kind']> = Extract<Need, { kind: K }> & { unit?: string };

/** Every need of one kind the profile names, project-wide ones first, each with the unit it came from. */
export function profileNeeds<K extends Need['kind']>(profile: RepoProfile, kind: K): NeedOf<K>[] {
  const of = (n: Need): n is NeedOf<K> => n.kind === kind;
  const top = profile.needs.filter(of);
  const units = profile.units.flatMap((u) => u.needs.filter(of).map((n) => ({ ...n, unit: u.dir })));
  return [...top, ...units];
}
