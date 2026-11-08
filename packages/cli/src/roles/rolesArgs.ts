import { BRAND } from '@teamtrail/core';
import type { RolesArgs } from './types';

const defaultDir = () => process.env[BRAND.dataDirEnv] || BRAND.dataDir;

/** `roles <command> [args] [--dir <path>] [--registry <name>] [--verified] [--approve-checks] [--json]`. */
export function parseRolesArgs(argv: string[]): RolesArgs | { error: string } {
  const o: RolesArgs = {
    command: argv[0] ?? '',
    dir: defaultDir(),
    rest: [],
    verified: false,
    approveChecks: false,
    json: false,
  };
  const args = argv.slice(1);
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].startsWith('--') && args[i].includes('=') ? args[i].split(/=(.*)/s, 2) : [args[i]];
    const value = () => inline ?? args[++i];
    if (flag === '--dir' || flag === '--registry') {
      const v = value();
      if (!v) return { error: `${flag} needs a value` };
      if (flag === '--dir') o.dir = v;
      else o.registry = v;
    } else if (flag === '--verified') o.verified = true;
    else if (flag === '--approve-checks') o.approveChecks = true;
    else if (flag === '--json') o.json = true;
    else if (flag.startsWith('-')) return { error: `unknown option: ${flag}` };
    else o.rest.push(flag);
  }
  return o;
}
