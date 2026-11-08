import { HELP } from '../args/help';
import { runRoles } from './rolesCommand';
import { ttyIo } from './ttyIo';

/** `teamtrail roles …` from the terminal: help, or the subcommand with its exit code. */
export async function rolesCli(argv: string[]) {
  if (argv.includes('-h') || argv.includes('--help')) return void process.stdout.write(HELP);
  process.exitCode = await runRoles(argv, ttyIo());
}
