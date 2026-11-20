import { programIdentity, type ProgramIdentity } from '../guides/programIdentity';
import type { CheckSpec } from '../model/verification';
import { repoPath } from '../verification/repoPath';
import { scriptPlan, type PackageManager } from '../verification/scriptPlan';
import { changedPackages } from './changedPackages';
import { commandsOf } from './commandsOf';
import { composerCommands, composerScript } from './composerScript';
import { makeReach } from './makeReach';
import { nxCommands, nxProject, type NxProject } from './nxTargets';
import { packageJson } from './packageJson';
import { ranCommand } from './ranCommand';
import { makeArgs, pkgArgs } from './reachArgs';
import { nxRun, turboRun, type TaskRun } from './taskRunnerArgs';
import type { CheckReach, GuardReaders } from './types';

/** Commands followed per check at most: scripts that call each other in a loop end here. */
const BUDGET = 300;
const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile'];
/** A word that names a file the command reads. Test files are left to the test check, so editing one isn't this. */
const FILE = /\.(m?[jt]sx?|c[jt]s|sh|bash|py|rb|pl|php|mk|ps1|json|jsonc|ya?ml|toml|ini|cfg)$/;
const TEST_FILE = /(\.|_)(test|spec)\.\w+$|(^|\/)(test_[^/]*|[^/]*_test)\.py$|(^|\/)__tests__\//;
const CONFIG_FLAG = /^(--config|-c|--project|-p|--rcfile|--config-file)$/;

const nameOf = (argv0: string) => (argv0.split(/[\\/]/).pop() ?? argv0).replace(/\.(cmd|exe|bat)$/i, '');
/** Build tools' wrapper scripts in the repo: the guard reads the build they run, as the tool's. */
const BUILD_WRAPPERS = new Set(['gradlew', 'mvnw']);

/** Walks a check's argv through scripts, makefiles and wrappers, recording what each command runs. */
class Walk {
  readonly reach: CheckReach;
  private queue: { cmd: string[]; dir: string }[] = [];
  private spent = 0;
  constructor(
    name: string,
    guards: string[],
    private read: GuardReaders,
    private changed: string[],
  ) {
    this.reach = {
      check: name,
      scripts: new Map(),
      tools: new Map(),
      files: new Set(),
      makefiles: new Map(),
      targets: new Map(),
      guards,
    };
  }

  async run(cmd: string[], dir: string) {
    this.queue.push({ cmd, dir });
    while (this.queue.length && this.spent++ < BUDGET) {
      const next = this.queue.shift()!;
      await this.visit(next.cmd, next.dir);
    }
  }

  private both = async (rel: string) => [await this.read.before(rel), await this.read.after(rel)];

  private async visit(cmd: string[], dir: string): Promise<void> {
    const [argv0, ...args] = cmd;
    if (!argv0) return;
    const id = programIdentity(argv0, dir);
    // a path into the repo's tool folders is the tool it installs (`.venv/bin/pytest` is pytest)
    if (id.kind === 'tool' && !BUILD_WRAPPERS.has(nameOf(argv0))) return this.visit([nameOf(argv0), ...args], dir);
    if (this.byPath({ id, argv0, args, dir })) return;
    const program = nameOf(argv0);
    if (program === 'npm' || program === 'pnpm' || program === 'yarn') return this.pkg(program, args, dir);
    if (program === 'npx' || program === 'pnpx' || program === 'bunx') {
      const at = args.findIndex((a) => !a.startsWith('-'));
      if (at >= 0) this.queue.push({ cmd: [args[at].replace(/(.)@.*$/, '$1'), ...args.slice(at + 1)], dir });
      return;
    }
    if (program === 'make' || program === 'gmake') return this.make(args, dir);
    const module = /^python[\d.]*$/.test(program) ? args.indexOf('-m') : -1;
    if (module >= 0 && args[module + 1]) return this.visit(args.slice(module + 1), dir);
    this.tool(program, dir);
    if (!(await this.runs(program, args, dir))) this.args(args, dir);
  }

  /**
   * What a program that runs others runs: a composer script, a wrapper's tool, turbo tasks, nx targets, an installed
   * tool an interpreter runs (`php vendor/bin/phpunit`). False when it runs nothing else.
   */
  private async runs(program: string, args: string[], dir: string): Promise<boolean> {
    const composer = program === 'composer' ? composerScript(args) : undefined;
    if (composer) await this.script(dir, composer, 'composer.json');
    else if (program === 'turbo') await this.turbo(turboRun(args), dir);
    else if (program === 'nx') await this.nx(nxRun(args), dir);
    const next = composer ? undefined : ranCommand({ program, args, dir });
    if (next) await this.visit(next.cmd, next.dir);
    return !!composer || !!next || program === 'turbo' || program === 'nx';
  }

  /**
   * A program named by a path (programIdentity.ts): a build wrapper (`./gradlew`) is both a file the check runs and
   * its build tool, any other file in the repo a script whose text counts. A path outside the repo is a program of that
   * path, never the tool it's named after (`/tmp/x/pytest` isn't pytest), so no runner's settings are read for it.
   * True when that's all there is to the command.
   */
  private byPath(o: { id: ProgramIdentity; argv0: string; args: string[]; dir: string }): boolean {
    if (o.id.kind === 'bare') return false;
    if (o.id.kind === 'outside') {
      this.tool(o.argv0, o.dir);
      this.args(o.args, o.dir);
      return true;
    }
    this.file(o.dir, o.argv0);
    return o.id.kind === 'file';
  }

  private tool(program: string, dir: string) {
    this.reach.tools.set(program, (this.reach.tools.get(program) ?? new Set<string>()).add(dir));
  }

  private file(dir: string, word: string) {
    const rel = repoPath(dir, word);
    if (rel && !TEST_FILE.test(rel) && !/[*?{]/.test(word)) this.reach.files.add(rel);
  }

  private args(args: string[], dir: string) {
    args.forEach((a, n) => {
      const inline = a.match(/^--(config|project|rcfile|config-file)=(.+)$/);
      if (inline) return this.file(dir, inline[2]);
      if (CONFIG_FLAG.test(a) && args[n + 1]) return this.file(dir, args[n + 1]);
      if (!a.startsWith('-') && FILE.test(a)) this.file(dir, a);
    });
  }

  /** `npm test`, `pnpm run lint --filter x`, `yarn exec vitest`: the script it runs in its folder, or the tool. */
  private async pkg(pm: PackageManager, args: string[], dir: string) {
    const { at, across, words } = pkgArgs(args, dir);
    const plan = scriptPlan(pm, words);
    if (plan.kind === 'tool' && plan.spec) {
      const from = words.indexOf(plan.spec);
      this.queue.push({ cmd: [plan.spec.replace(/(.)@.*$/, '$1'), ...words.slice(from + 1)], dir: at });
    }
    if (plan.kind !== 'script') return;
    await this.script(at, plan.name);
    if (across) for (const folder of await this.packagesUnder(at, 'package.json')) await this.script(folder, plan.name);
  }

  /**
   * A package.json script (or composer.json's), its pre and post scripts (package.json only), and the commands they
   * run, read before and after.
   */
  private async script(dir: string, name: string, file = 'package.json') {
    const pkgPath = repoPath(dir, file) ?? file;
    const names = this.reach.scripts.get(pkgPath) ?? new Set<string>();
    this.reach.scripts.set(pkgPath, names);
    if (names.has(name)) return;
    const composer = file === 'composer.json';
    const run = composer ? [name] : [`pre${name}`, name, `post${name}`];
    run.forEach((n) => names.add(n));
    const parse = composer ? composerCommands : commandsOf;
    for (const text of await this.both(pkgPath)) {
      const pkg = packageJson(text);
      if (!pkg || pkg === 'invalid') continue;
      for (const n of run) for (const cmd of parse(pkg.scripts[n] ?? '')) this.queue.push({ cmd, dir });
    }
  }

  /** Packages under `dir` that hold a changed file (changedPackages.ts). */
  private packagesUnder(dir: string, ...markers: string[]) {
    return changedPackages({ changed: this.changed, dir, markers, ...this.read });
  }

  /** `turbo run test`: the task's script in every package of the workspace that holds a change (`web#test`: in web). */
  private async turbo(run: TaskRun, dir: string) {
    for (const folder of await this.packagesUnder(dir, 'package.json'))
      for (const target of run.targets) await this.script(folder, target);
  }

  /**
   * `nx test web`, `nx run-many -t test`: in each project that holds a change (its project.json or package.json
   * named as asked, or any when none is), the target's definition in project.json and the commands it runs, else the
   * package.json script of that name, which Nx runs as the target.
   */
  private async nx(run: TaskRun, dir: string) {
    for (const folder of await this.packagesUnder(dir, 'project.json', 'package.json')) {
      const file = repoPath(folder, 'project.json') ?? 'project.json';
      const projects = (await this.both(file)).map(nxProject);
      const names = await this.projectNames(
        folder,
        projects.map((p) => p?.name),
      );
      if (run.projects.length && !run.projects.some((p) => names.includes(p))) continue;
      for (const target of run.targets) await this.nxTarget({ folder, file, projects, target, root: dir });
    }
  }

  /** One target of one project: project.json's definition and its commands, else the package.json script. */
  private async nxTarget(o: {
    folder: string;
    file: string;
    projects: (NxProject | undefined)[];
    target: string;
    root: string;
  }) {
    if (!o.projects.some((p) => p && o.target in p.targets)) return this.script(o.folder, o.target);
    this.reach.targets.set(o.file, (this.reach.targets.get(o.file) ?? new Set<string>()).add(o.target));
    const commands = o.projects.flatMap((p) => nxCommands(p?.targets[o.target]));
    for (const c of commands) this.queue.push({ cmd: c.cmd, dir: repoPath(o.root, c.cwd) ?? o.root });
  }

  /** A project's names: project.json's `name`, else its package.json's, else its folder's. */
  private async projectNames(folder: string, fromProject: (string | undefined)[]) {
    const named = fromProject.filter((n): n is string => !!n);
    if (named.length) return named;
    for (const text of await this.both(repoPath(folder, 'package.json') ?? 'package.json')) {
      const name = nxProject(text)?.name;
      if (name) named.push(name);
    }
    return named.length ? named : [folder.split('/').pop() ?? folder];
  }

  /** `make -C dir -f file target`: the makefile, its target, and the recipes the target reaches. */
  private async make(args: string[], dir: string) {
    const { at, file, target } = makeArgs(args, dir);
    const names = file ? [file] : MAKEFILES;
    for (const name of names) {
      const rel = repoPath(at, name);
      if (!rel) continue;
      const texts = await this.both(rel);
      if (texts.every((t) => t == null) && !file) continue;
      const targets = this.reach.makefiles.get(rel) ?? new Set<string>();
      this.reach.makefiles.set(rel, targets.add(target));
      const recipes = texts.flatMap((text) => (text == null ? [] : makeReach(text, target || undefined).recipes));
      for (const cmd of recipes.flatMap(commandsOf)) this.queue.push({ cmd, dir: at });
      return;
    }
  }
}

/**
 * What one approved check runs, read from its argv and the repo before and after the work: the package.json scripts
 * it reaches (`npm test` → `scripts.test` → `npm run unit` → …, across workspace packages that hold a change), and
 * composer.json's (`composer test`), the tasks `turbo run` runs in each changed package and the Nx targets `nx test
 * web` runs (project.json's definition and its commands, else the package script), the tool behind a wrapper (`bundle
 * exec`, `poetry run`, `uv run`, `pipenv run`, `composer exec`) or a dependency folder (`vendor/bin/phpunit`,
 * `.venv/bin/pytest`), a build wrapper as its build tool (`./gradlew`), the tools those run, the files they name and
 * the makefile targets. Deterministic and read-only.
 */
export async function checkReach(o: {
  name: string;
  spec: CheckSpec;
  read: GuardReaders;
  changed: string[];
}): Promise<CheckReach> {
  const walk = new Walk(o.name, o.spec.guards ?? [], o.read, o.changed);
  await walk.run(o.spec.run, repoPath(o.spec.cwd) ?? '');
  return walk.reach;
}
