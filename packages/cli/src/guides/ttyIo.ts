import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import type { GuidesIo } from './types';

/**
 * A long text through the person's pager ($PAGER, else `less`), so all of it can be read before they answer; text
 * that fits the screen, or a pager that fails, is printed as is. `less -X` leaves it on the screen afterwards; no
 * `-R`, so less shows any escape sequence instead of passing it to the terminal (the text is printable() already).
 */
function page(text: string) {
  const rows = process.stdout.rows ?? 0;
  if (!rows || text.split('\n').length < rows - 4) return void process.stdout.write(text);
  const pager = process.env.PAGER?.trim();
  const stdio: ['pipe', 'inherit', 'inherit'] = ['pipe', 'inherit', 'inherit'];
  const r = pager
    ? spawnSync(pager, { input: text, stdio, shell: true })
    : spawnSync('less', ['-X'], { input: text, stdio });
  if (r.error || r.status !== 0) process.stdout.write(text);
}

/** The terminal: prompts only when stdin and stdout are a TTY, so scripts and CI never approve by accident. */
export function ttyIo(): GuidesIo {
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  return {
    out: (t) => void process.stdout.write(t),
    err: (t) => void process.stderr.write(t),
    page: interactive ? page : (t) => void process.stdout.write(t),
    interactive,
    async confirm(question) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return /^y(es)?$/i.test((await rl.question(question)).trim());
      } finally {
        rl.close();
      }
    },
  };
}
