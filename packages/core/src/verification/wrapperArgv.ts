/**
 * Programs that run a tool from the project's own environment: `uv run`, `poetry run`, `pipenv run`, `pdm run`, `rye
 * run`, `bundle exec`, `composer exec`, `pnpm exec`, `npx`. The one reading of them: the check argv rules
 * (guides/wrappedCheck.ts, which allows only some), screening (screenWrapped.ts) and the check guard (checkReach.ts)
 * all go through wrapperArgv. `sub` is the subcommand that runs the tool; `valued`, the wrapper's flags that
 * take the next word (so it isn't read as the tool); `dir`, those that move it to another folder.
 */
interface WrapperSpec {
  sub?: string;
  valued: string[];
  dir?: string[];
}

const UV_VALUED = [
  '--extra',
  '--group',
  '--only-group',
  '--no-group',
  '--package',
  '--directory',
  '--project',
  '-p',
  '--python',
  '--with',
  '--with-editable',
  '--with-requirements',
  '--env-file',
  '--index',
  '--default-index',
  '--index-url',
  '--extra-index-url',
  '-f',
  '--find-links',
  '--from',
];

export const WRAPPER_SPECS: Record<string, WrapperSpec> = {
  uv: { sub: 'run', valued: UV_VALUED, dir: ['--directory', '--project'] },
  poetry: {
    sub: 'run',
    valued: ['-C', '--directory', '-P', '--project'],
    dir: ['-C', '--directory', '-P', '--project'],
  },
  pipenv: { sub: 'run', valued: [] },
  pdm: { sub: 'run', valued: ['-p', '--project'], dir: ['-p', '--project'] },
  rye: { sub: 'run', valued: [] },
  bundle: { sub: 'exec', valued: ['--gemfile'] },
  composer: { sub: 'exec', valued: ['-d', '--working-dir'], dir: ['-d', '--working-dir'] },
  pnpm: { sub: 'exec', valued: ['--filter', '-F', '-C', '--dir'], dir: ['-C', '--dir'] },
  npx: { valued: ['-p', '--package', '-c', '--call'] },
};

/** A wrapped command, read: the wrapper's own flags (with their values), the folder it moves to, and the tool's argv. */
export interface WrappedArgv {
  flags: { name: string; value?: string }[];
  dir?: string;
  tool: string[];
}

/**
 * The tool a wrapper runs (`uv run --frozen pytest -q` → flags `--frozen`, tool `pytest -q`), or undefined when the
 * words aren't that wrapper's run form (`uv sync`, `bundle install`). Flags may come before and after the subcommand;
 * `--` ends them.
 */
export function wrapperArgv(program: string, args: string[]): WrappedArgv | undefined {
  const spec = WRAPPER_SPECS[program];
  if (!spec) return undefined;
  const flags: WrappedArgv['flags'] = [];
  let dir: string | undefined;
  let subSeen = !spec.sub;
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (a === '--') return subSeen ? { flags, dir, tool: args.slice(n + 1) } : undefined;
    if (!a.startsWith('-')) {
      if (subSeen) return { flags, dir, tool: args.slice(n) };
      if (a !== spec.sub) return undefined;
      subSeen = true;
      continue;
    }
    const [name, inline] = a.startsWith('--') ? a.split(/=(.*)/s, 2) : [a, undefined];
    const takesNext = inline === undefined && spec.valued.includes(name);
    const value = takesNext ? args[++n] : inline;
    flags.push(value === undefined ? { name } : { name, value });
    if (spec.dir?.includes(name) && value !== undefined) dir = value;
  }
  return undefined;
}
