import { HELP } from '../args/help';
import { runGuides } from './guidesCommand';
import { ttyIo } from './ttyIo';

/** `teamtrail guides …` from the terminal: help, or the subcommand with its exit code. */
export async function guidesCli(argv: string[]) {
  if (argv.includes('-h') || argv.includes('--help')) return void process.stdout.write(HELP);
  process.exitCode = await runGuides(argv, ttyIo());
}
