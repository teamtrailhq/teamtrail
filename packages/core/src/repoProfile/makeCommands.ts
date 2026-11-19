import type { CommandRole, UnitCommand } from '../model/repoProfile';

/** Makefile targets the profile reads as checks, by role. */
const TARGETS: [string, CommandRole][] = [
  ['test', 'test'],
  ['lint', 'lint'],
  ['typecheck', 'typecheck'],
  ['check', 'check'],
];

/** The check-like targets a Makefile defines (`test:`, `lint:`), as `make <target>` in its folder. */
export function makeCommands(o: { text: string; dir: string; file: string }): UnitCommand[] {
  const defined = new Set([...o.text.matchAll(/^([A-Za-z][\w-]*)\s*:(?!=)/gm)].map((m) => m[1]));
  return TARGETS.filter(([target]) => defined.has(target)).map(([target, role]) => ({
    role,
    run: ['make', target],
    cwd: o.dir,
    from: `${o.file} target ${target}`,
  }));
}
