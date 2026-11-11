/**
 * How an interpreter takes code on its command line: the short flags whose value is code (`inline`), the short flags
 * that take some other value (`value`, so the rest of a combined flag is that value), the long flags whose value is
 * code, and the flag after which the remaining arguments belong to a module (`stop`).
 */
interface Interpreter {
  inline: string;
  value: string;
  long: string[];
  /** Long flags that take the next argument as their value. */
  longValue?: string[];
  stop?: string;
}

const NODE_VALUES = ['--require', '--import', '--loader', '--experimental-loader', '--env-file', '--input-type'];
const NODE: Interpreter = { inline: 'ep', value: 'rC', long: ['--eval', '--print'], longValue: NODE_VALUES };
const INTERPRETERS: Record<string, Interpreter> = {
  node: NODE,
  nodejs: NODE,
  bun: { inline: 'e', value: 'r', long: ['--eval', '--print'] },
  python: { inline: 'c', value: 'mWXQ', long: ['--command'], stop: '-m' },
  pypy: { inline: 'c', value: 'mWXQ', long: [], stop: '-m' },
  ruby: { inline: 'e', value: 'rICEx', long: [] },
  perl: { inline: 'eEMm', value: 'IxCd', long: [] },
  php: { inline: 'rBRFE', value: 'dcfz', long: [] },
  lua: { inline: 'e', value: 'l', long: [] },
  luajit: { inline: 'e', value: 'lbj', long: [] },
  rscript: { inline: 'e', value: '', long: ['--expr'] },
  osascript: { inline: 'e', value: 'sl', long: [] },
};

/** What one option does: carries code, takes the next argument as its value, or neither. */
type Reading = 'code' | 'takes-next' | 'plain';

/** A short-flag argument (`-abc`, `-cCODE`, `-r x`), read flag by flag as the program would. */
function readShort(arg: string, it: Interpreter): Reading {
  const flags = arg.slice(1);
  for (let i = 0; i < flags.length; i++) {
    if (it.inline.includes(flags[i])) return 'code';
    if (it.value.includes(flags[i])) return i === flags.length - 1 ? 'takes-next' : 'plain';
  }
  return 'plain';
}

/** One option: `--eval`, `--eval=…`, `-e`, `-pe`, `-cimport os` and a `data:` module carry code. */
function readOption(arg: string, it: Interpreter): Reading {
  if (/^data:|=data:/i.test(arg)) return 'code';
  if (!arg.startsWith('--')) return readShort(arg, it);
  const [name, value] = arg.toLowerCase().split(/=(.*)/s, 2);
  if (it.long.includes(name)) return 'code';
  return value === undefined && it.longValue?.includes(name) ? 'takes-next' : 'plain';
}

/**
 * Why `program args` runs code given inline rather than a file in the repo, if it does. Options are read up to the
 * script (the first argument that isn't an option), `--`, or a module flag (`python -m pytest -c x.ini` is pytest's
 * `-c`), the way the interpreter itself reads them.
 */
export function inlineCodeProblem(program: string, args: string[]): string | undefined {
  const it = INTERPRETERS[program];
  if (!it) return undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--' || !arg.startsWith('-') || arg === it.stop) return undefined;
    const reading = readOption(arg, it);
    if (reading === 'code') return 'runs code given inline; point at a script in the repo instead';
    if (reading === 'takes-next' && /^data:/i.test(args[i + 1] ?? '')) return 'runs code given inline';
    if (reading === 'takes-next') i++;
  }
  return undefined;
}
