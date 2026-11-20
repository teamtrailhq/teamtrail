import type { UnitTask } from '../model/repoProfile';

/** Makefile targets that build or run the project, the usual names first. */
const TARGETS: [UnitTask['role'], string[]][] = [
  ['build', ['build']],
  ['run', ['run', 'dev', 'serve', 'start']],
];

/** The build and run targets a Makefile defines, as `make <target>` in its folder. */
export function makeTasks(o: { text: string; dir: string; file: string }): UnitTask[] {
  const defined = new Set([...o.text.matchAll(/^([A-Za-z][\w-]*)\s*:(?!=)/gm)].map((m) => m[1]));
  return TARGETS.flatMap(([role, names]) => {
    const target = names.find((n) => defined.has(n));
    return target ? [{ role, run: ['make', target], cwd: o.dir, from: `${o.file} target ${target}` }] : [];
  });
}
