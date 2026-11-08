import { createInterface } from 'node:readline/promises';
import type { GuidesIo } from './types';

/** The terminal: prompts only when stdin and stdout are a TTY, so scripts and CI never approve by accident. */
export function ttyIo(): GuidesIo {
  return {
    out: (t) => void process.stdout.write(t),
    err: (t) => void process.stderr.write(t),
    interactive: !!process.stdin.isTTY && !!process.stdout.isTTY,
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
