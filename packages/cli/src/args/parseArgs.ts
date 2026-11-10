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

function portOf(value: string, arg: () => string) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) fail(`invalid port: ${arg()}`);
  return n;
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
      case '--port':
        o.port = portOf(value(), arg);
        o.portExplicit = true;
        break;
      default:
        fail(`unknown option: ${arg()}`);
    }
  });
  return o;
}

export interface SubOptions {
  dir: string;
  agent?: string;
  leaseMinutes?: number;
  noRegister?: boolean;
  /** `mcp --http`: serve over streamable HTTP instead of stdio. */
  http?: boolean;
  host?: string;
  port?: number;
  allowHosts: string[];
  /** `connect --url`: a remote MCP endpoint, with its token from `--token`, `--token-stdin` or the environment. */
  url?: string;
  token?: string;
  tokenStdin?: boolean;
  /** `connect --url`: check the token against a plain-HTTP endpoint on another machine anyway. */
  allowHttp?: boolean;
  rest: string[];
}

/** What each subcommand flag sets. */
const SUB_FLAGS: Record<string, (o: SubOptions, f: Flag) => void> = {
  '--dir': (o, f) => void (o.dir = f.value()),
  '--agent': (o, f) => void (o.agent = f.value()),
  '--no-register': (o) => void (o.noRegister = true),
  '--lease-minutes': (o, f) => {
    o.leaseMinutes = Number(f.value());
    if (!(o.leaseMinutes > 0)) fail(`invalid lease length: ${f.arg()}`);
  },
  '--http': (o) => void (o.http = true),
  '--host': (o, f) => void (o.host = f.value()),
  '--port': (o, f) => void (o.port = portOf(f.value(), f.arg)),
  '--allow-host': (o, f) => void o.allowHosts.push(f.value()),
  '--url': (o, f) => void (o.url = f.value()),
  '--token': (o, f) => void (o.token = f.value()),
  '--token-stdin': (o) => void (o.tokenStdin = true),
  '--allow-http': (o) => void (o.allowHttp = true),
};

/** Options of the `mcp` and `connect` subcommands; `allowed` lists the flags the subcommand takes. */
export function parseSubArgs(argv: string[], allowed: string[]): SubOptions {
  const o: SubOptions = { dir: defaultDir(), allowHosts: [], rest: [] };
  eachFlag(argv, (f) => {
    if (f.flag === '-h' || f.flag === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    }
    const set = allowed.includes(f.flag) ? SUB_FLAGS[f.flag] : undefined;
    if (set) set(o, f);
    else if (f.flag.startsWith('-')) fail(`unknown option: ${f.arg()}`);
    else o.rest.push(f.arg());
  });
  return o;
}
