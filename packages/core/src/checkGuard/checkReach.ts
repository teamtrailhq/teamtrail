import type { CheckSpec } from '../model/verification';
import { repoPath } from '../verification/repoPath';
import { scriptPlan, type PackageManager } from '../verification/scriptPlan';
import { commandsOf } from './commandsOf';
import { makeReach } from './makeReach';
import { packageJson } from './packageJson';
import type { CheckReach, GuardReaders } from './types';

/** Commands followed per check at most: scripts that call each other in a loop end here. */
const BUDGET = 300;
const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile'];
/** Flags that run a script across a workspace's packages, and those that move it to another folder. */
const ACROSS = /^(-w|--workspace|--workspaces|-ws|-r|--recursive|--filter|-F)(=|$)/;
const MOVE = /^(--prefix|-C|--dir|--cwd)(=|$)/;
const VALUED = new Set(['-w', '--workspace', '--filter', '-F', '--prefix', '-C', '--dir', '--cwd']);
/** A word that names a file the command reads. Test files are left to the test check, so editing one isn't this. */
const FILE = /\.(m?[jt]sx?|c[jt]s|sh|bash|py|rb|pl|php|mk|ps1|json|jsonc|ya?ml|toml|ini|cfg)$/;
const TEST_FILE = /(\.|_)(test|spec)\.\w+$|(^|\/)(test_[^/]*|[^/]*_test)\.py$|(^|\/)__tests__\//;
const CONFIG_FLAG = /^(--config|-c|--project|-p|--rcfile|--config-file)$/;

const nameOf = (argv0: string) => (argv0.split('/').pop() ?? argv0).replace(/\.(cmd|exe)$/i, '');

/** A flag's value: after `=`, else the next word for flags that take one. */
function flagValue(args: string[], n: number) {
  const a = args[n];
  if (a.includes('=')) return { value: a.slice(a.indexOf('=') + 1), next: n };
  return VALUED.has(a) ? { value: args[n + 1], next: n + 1 } : { value: undefined, next: n };
}

/** A package manager's words without the flags that move it (`--prefix`) or run it across packages (`-w`). */
function pkgArgs(args: string[], dir: string) {
  let at = dir;
  let across = false;
  const words: string[] = [];
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (!ACROSS.test(a) && !MOVE.test(a)) {
      words.push(a);
      continue;
    }
    const { value, next } = flagValue(args, n);
    n = next;
    if (MOVE.test(a)) at = repoPath(dir, value) ?? dir;
    else across = true;
  }
  return { at, across, words };
}

/** The folder (`-C`), makefile (`-f`) and first target of a `make` command. */
function makeArgs(args: string[], dir: string) {
  let at = dir;
  let file: string | undefined;
  let target = '';
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (a === '-C' || a === '--directory') at = repoPath(at, args[++n]) ?? at;
    else if (a === '-f' || a === '--file' || a === '--makefile') file = args[++n];
    else if (!a.startsWith('-') && !a.includes('=') && !target) target = a;
  }
  return { at, file, target };
}

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
    const bin = argv0.match(/(^|\/)node_modules\/\.bin\/([^/]+)$/);
    if (bin) return this.visit([bin[2], ...args], dir);
    if (argv0.includes('/') && !argv0.startsWith('/')) return this.file(dir, argv0);
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
    this.reach.tools.set(program, (this.reach.tools.get(program) ?? new Set<string>()).add(dir));
    this.args(args, dir);
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
    if (across) for (const folder of await this.packagesUnder(at)) await this.script(folder, plan.name);
  }

  /** A package.json script, its pre and post scripts, and the commands they run, read before and after. */
  private async script(dir: string, name: string) {
    const pkgPath = repoPath(dir, 'package.json') ?? 'package.json';
    const names = this.reach.scripts.get(pkgPath) ?? new Set<string>();
    this.reach.scripts.set(pkgPath, names);
    if (names.has(name)) return;
    for (const n of [`pre${name}`, name, `post${name}`]) names.add(n);
    for (const text of await this.both(pkgPath)) {
      const pkg = packageJson(text);
      if (!pkg || pkg === 'invalid') continue;
      for (const n of [`pre${name}`, name, `post${name}`])
        for (const cmd of commandsOf(pkg.scripts[n] ?? '')) this.queue.push({ cmd, dir });
    }
  }

  /** Packages a workspace run reaches that hold a changed file: only those can have changed what it runs. */
  private async packagesUnder(dir: string) {
    const folders = new Set<string>();
    for (const f of this.changed) {
      if (dir && !f.startsWith(`${dir}/`)) continue;
      const parts = f.split('/').slice(0, -1);
      for (let n = parts.length; n > (dir ? dir.split('/').length : 0); n--) folders.add(parts.slice(0, n).join('/'));
    }
    const out: string[] = [];
    for (const folder of folders) {
      const [b, a] = await this.both(`${folder}/package.json`);
      if (b != null || a != null) out.push(folder);
    }
    return out;
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
 * it reaches (`npm test` → `scripts.test` → `npm run unit` → …, across workspace packages that hold a change), the
 * tools those run, the files they name and the makefile targets. Deterministic and read-only.
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
