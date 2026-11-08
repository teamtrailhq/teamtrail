import { BRAND } from '@teamtrail/core';
import { fail, HELP } from './help';

export interface ServeOptions {
  dir: string;
  port: number;
  portExplicit: boolean;
  host: string;
  open: boolean;
}

interface Flag {
  /** The flag without an inline value: `--dir` for `--dir=x`. */
  flag: string;
  /** The flag's value, inline (`--dir=x`) or the next argument. */
  value: () => string;
  /** The argument currently read: the flag, or its value once `value()` read the next argument. */
  arg: () => string;
}

function eachFlag(argv: string[], fn: (f: Flag) => void) {
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] =
      argv[i].startsWith('--') && argv[i].includes('=') ? argv[i].split(/=(.*)/s, 2) : [argv[i], undefined];
    fn({ flag, value: () => inline ?? argv[++i] ?? fail(`${flag} needs a value`), arg: () => argv[i] });
  }
}

const defaultDir = () => process.env[BRAND.dataDirEnv] || BRAND.dataDir;

/** Options of the default command, which serves the Lookout. */
export function parseArgs(argv: string[]): ServeOptions {
  const o: ServeOptions = {
    dir: defaultDir(),
    port: 7420,
    portExplicit: false,
    host: '127.0.0.1',
    open: true,
  };
  eachFlag(argv, ({ flag, value, arg }) => {
    switch (flag) {
      case '-h':
      case '--help':
        process.stdout.write(HELP);
        process.exit(0);
      case '-v':
      case '--version':
        process.stdout.write(`${__VERSION__}\n`);
        process.exit(0);
      case '--no-open':
        o.open = false;
        break;
      case '--dir':
        o.dir = value();
        break;
      case '--host':
        o.host = value();
        break;
      case '--port': {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 0 || n > 65535) fail(`invalid port: ${arg()}`);
        o.port = n;
        o.portExplicit = true;
        break;
      }
      default:
        fail(`unknown option: ${arg()}`);
    }
  });
  return o;
}

/** Options of the `mcp` and `connect` subcommands. */
export function parseSubArgs(argv: string[], allowed: string[]) {
  const o: { dir: string; agent?: string; leaseMinutes?: number; noRegister?: boolean; rest: string[] } = {
    dir: defaultDir(),
    rest: [],
  };
  eachFlag(argv, ({ flag, value, arg }) => {
    if (flag === '-h' || flag === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (flag.startsWith('-') && !allowed.includes(flag)) fail(`unknown option: ${arg()}`);
    else if (flag === '--dir') o.dir = value();
    else if (flag === '--agent') o.agent = value();
    else if (flag === '--no-register') o.noRegister = true;
    else if (flag === '--lease-minutes') {
      o.leaseMinutes = Number(value());
      if (!(o.leaseMinutes > 0)) fail(`invalid lease length: ${arg()}`);
    } else o.rest.push(arg());
  });
  return o;
}
