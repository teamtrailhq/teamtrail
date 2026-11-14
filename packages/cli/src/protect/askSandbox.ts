import { createInterface } from 'node:readline/promises';
import { sandboxChoice, type SandboxChoice } from './sandboxChoice';

async function ask(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

/**
 * `connect claude`'s sandbox choice in this terminal: asked only when stdin and stdout are a TTY, so scripts and CI
 * never turn it on by accident. Undefined where connect doesn't touch it: `--no-protect-config` and Windows.
 */
export async function askSandbox(o: {
  cwd: string;
  flag?: boolean;
  protect: boolean;
}): Promise<SandboxChoice | undefined> {
  if (!o.protect || process.platform === 'win32') return undefined;
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  return sandboxChoice({ cwd: o.cwd, flag: o.flag, interactive, ask });
}
