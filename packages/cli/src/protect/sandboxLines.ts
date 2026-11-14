import path from 'node:path';
import type { SandboxResult } from './applySandbox';

const PAD = '                  ';

/** Linux runs the sandbox through bubblewrap and socat; without them Claude Code runs commands unsandboxed. */
const LINUX = `${PAD}On Linux it needs bubblewrap and socat (e.g. apt install bubblewrap socat); without them commands run unsandboxed.`;

const LEFT: Record<Extract<SandboxResult, { kind: 'left' }>['why'], string> = {
  'no-sandbox': 'left as it is (--no-sandbox)',
  declined: 'left as it is (you said no)',
  'no-tty': 'not changed (no terminal to ask in)',
};

/**
 * What `connect claude` prints about Claude Code's sandbox. `guarded` is whether the config folder's deny rules are
 * in place: the sandbox keeps shell commands out of it only through them.
 */
export function sandboxLines(o: { result: SandboxResult; cwd: string; guarded: boolean }): string[] {
  const r = o.result;
  const relative = path.relative(o.cwd, r.file);
  const outside = relative.startsWith('..') || path.isAbsolute(relative);
  const shown = outside ? r.file : relative;
  const reach = o.guarded
    ? "shell commands can't reach the config folder either"
    : 'shell commands run in it, but the config folder is not denied (above)';
  const turnOn = `${PAD}To turn it on: connect claude --sandbox, or set "sandbox": { "enabled": true } in ${shown}.`;
  switch (r.kind) {
    case 'turned-on':
      return [
        `  Sandbox         on · ${shown} · ${reach}`,
        `${PAD}Added "sandbox": { "enabled": true }. Commands still ask you as before, and a new network domain asks too.`,
        ...(process.platform === 'linux' ? [LINUX] : []),
        `${PAD}To undo: delete "enabled" from "sandbox" in ${shown}.`,
      ];
    case 'already-on':
      return [`  Sandbox         already on · ${shown} · ${reach}`];
    case 'left':
      return [`  Sandbox         ${LEFT[r.why]}: shell commands can still read the config folder.`, turnOn];
    case 'unreadable':
      return [
        `  Sandbox         not turned on: ${shown} was not changed (it isn't plain JSON, or "sandbox" there has another shape).`,
        `${PAD}Set "sandbox": { "enabled": true } in it by hand.`,
      ];
    default: {
      const never: never = r;
      return never;
    }
  }
}
