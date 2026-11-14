import { claudeSandboxState } from './claudeSandboxState';

/** What the person chose about Claude Code's sandbox: on, left by `--no-sandbox`, declined, or not asked (no TTY). */
export type SandboxChoice = 'on' | 'no-sandbox' | 'declined' | 'no-tty';

const QUESTION =
  "  Turn on Claude Code's sandbox for this project? Its shell commands then can't read or change Teamtrail's config folder either. [Y/n] ";

/**
 * `connect claude`'s sandbox question, asked before anything is written: `--sandbox` (flag true) and
 * `--no-sandbox` (false) answer it; without a terminal nothing changes. Not asked when the sandbox is already on.
 * An empty answer is yes.
 */
export async function sandboxChoice(o: {
  cwd: string;
  flag?: boolean;
  interactive: boolean;
  ask: (question: string) => Promise<string>;
}): Promise<SandboxChoice> {
  if (o.flag === true) return 'on';
  if (o.flag === false) return 'no-sandbox';
  if (claudeSandboxState(o.cwd).kind === 'on') return 'on';
  if (!o.interactive) return 'no-tty';
  const answer = (await o.ask(QUESTION)).trim();
  const yes = answer === '' || /^y(es)?$/i.test(answer);
  return yes ? 'on' : 'declined';
}
