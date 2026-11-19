/** A JavaScript package manager a check can name. */
export type JsPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Where a package manager's command runs, read from its flags: the workspaces it names (`npm -w web`, `pnpm --filter
 * web`, `yarn workspace web`), every workspace (`-ws`, `-r`), another folder (`--prefix`, `-C`, `--dir`, `--cwd`), and
 * `--if-present` (a missing script is fine). `words` is the command without those flags, as the package manager reads
 * it after them (`run lint --silent`).
 */
export interface PmRoute {
  words: string[];
  workspaces: string[];
  all: boolean;
  dir?: string;
  ifPresent: boolean;
}

type FlagKind = 'workspace' | 'all' | 'dir' | 'if-present' | 'root';

/** Each package manager's routing flags; `valued` ones take the next word (or `=value`). */
const FLAGS: Record<JsPackageManager, { flags: Record<string, FlagKind>; valued: Set<string>; leadingOnly: boolean }> =
  {
    npm: {
      flags: {
        '-w': 'workspace',
        '--workspace': 'workspace',
        '-ws': 'all',
        '--workspaces': 'all',
        '--include-workspace-root': 'root',
        '--prefix': 'dir',
        '-C': 'dir',
        '--if-present': 'if-present',
      },
      valued: new Set(['-w', '--workspace', '--prefix', '-C']),
      // npm reads its own flags anywhere before `--` (`npm test -w web`)
      leadingOnly: false,
    },
    pnpm: {
      flags: {
        '--filter': 'workspace',
        '-F': 'workspace',
        '-r': 'all',
        '--recursive': 'all',
        '-C': 'dir',
        '--dir': 'dir',
        '-w': 'root',
        '--workspace-root': 'root',
        '--if-present': 'if-present',
      },
      valued: new Set(['--filter', '-F', '-C', '--dir']),
      // after the script's name, words are the script's
      leadingOnly: true,
    },
    yarn: {
      flags: { '--cwd': 'dir' },
      valued: new Set(['--cwd']),
      leadingOnly: true,
    },
    bun: {
      flags: { '--filter': 'workspace', '-F': 'workspace', '--cwd': 'dir', '--if-present': 'if-present' },
      valued: new Set(['--filter', '-F', '--cwd']),
      leadingOnly: true,
    },
  };

const empty = (words: string[]): PmRoute => ({ words, workspaces: [], all: false, ifPresent: false });

/** One routing flag (`-w x`, `--workspace=x`, `-ws`) at `n`: what it is, its value and the next index to read. */
function readFlag(pm: JsPackageManager, args: string[], n: number) {
  const spec = FLAGS[pm];
  const a = args[n];
  const eq = a.startsWith('--') ? a.indexOf('=') : -1;
  const name = eq > 0 ? a.slice(0, eq) : a;
  const kind = spec.flags[name];
  if (!kind) return undefined;
  if (!spec.valued.has(name)) return { kind, value: undefined, next: n };
  if (eq > 0) return { kind, value: a.slice(eq + 1), next: n };
  return { kind, value: args[n + 1] as string | undefined, next: n + 1 };
}

/** Records one routing flag on the route. */
function apply(route: PmRoute, kind: FlagKind, value: string | undefined) {
  if (kind === 'workspace' && value) route.workspaces.push(value);
  if (kind === 'all') route.all = true;
  if (kind === 'dir' && value) route.dir = value;
  if (kind === 'if-present') route.ifPresent = true;
}

/** `yarn workspace <name> <command…>` (Yarn 2+): the workspace, then the command. */
function yarnWorkspace(route: PmRoute): PmRoute {
  const at = route.words.findIndex((w) => !w.startsWith('-'));
  if (route.words[at] !== 'workspace' || !route.words[at + 1]) return route;
  const words = [...route.words.slice(0, at), ...route.words.slice(at + 2)];
  return { ...route, words, workspaces: [...route.workspaces, route.words[at + 1]] };
}

/**
 * The route of `npm …`, `pnpm …`, `yarn …` or `bun …` from its words after the program. Flags are read where the
 * package manager reads them: npm anywhere before `--`, the others before the first word that isn't a flag.
 */
export function pmRoute(pm: JsPackageManager, args: string[]): PmRoute {
  const route = empty([]);
  let reading = true;
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (a === '--') reading = false;
    if (reading && !a.startsWith('-') && FLAGS[pm].leadingOnly) reading = false;
    const flag = reading && a.startsWith('-') ? readFlag(pm, args, n) : undefined;
    if (!flag) {
      route.words.push(a);
      continue;
    }
    apply(route, flag.kind, flag.value);
    n = flag.next;
  }
  return pm === 'yarn' ? yarnWorkspace(route) : route;
}
