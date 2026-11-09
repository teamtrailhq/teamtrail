import { BRAND } from '@teamtrail/core';
import type { GuidesArgs } from './types';

const VALUE_FLAGS = { '--dir': 'dir', '--registry': 'registry', '--author': 'author' } as const;

const defaultDir = () => process.env[BRAND.dataDirEnv] || BRAND.dataDir;

/** `guides <command> [args] [--dir <path>] [--registry <name>] [--author <name>] [--verified] [--approve-checks] [--json]`. */
export function parseGuidesArgs(argv: string[]): GuidesArgs | { error: string } {
  const o: GuidesArgs = {
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
    if (flag in VALUE_FLAGS) {
      const v = value();
      if (!v) return { error: `${flag} needs a value` };
      o[VALUE_FLAGS[flag as keyof typeof VALUE_FLAGS]] = v;
    } else if (flag === '--verified') o.verified = true;
    else if (flag === '--approve-checks') o.approveChecks = true;
    else if (flag === '--json') o.json = true;
    else if (flag.startsWith('-')) return { error: `unknown option: ${flag}` };
    else o.rest.push(flag);
  }
  return o;
}
