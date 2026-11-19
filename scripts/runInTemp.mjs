import { spawn } from 'node:child_process';
import { reportLeftovers } from './reportLeftovers.mjs';
import { testTemp } from './testTemp.mjs';

/**
 * Runs `command` in a run temp folder of its own (testTemp.mjs) and resolves with the exit code to use. The folder is
 * removed when the command ends, also when this process is stopped by a signal: the signal is passed on and the
 * folder removed once the command is gone (verifySlack.mjs stops `run.mjs serve` that way, by its process group).
 * `env(dir)` gives the command's environment; `expected` names entries the runner made itself; with `strict`, what
 * else is left fails the run.
 */
export function runInTemp({ label, command, args, env, expected = [], strict = true }) {
  const temp = testTemp(label);
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...env(temp.dir), ...temp.env } });
    let stopped = false;
    const forward = (signal) => {
      stopped = true;
      child.kill(signal);
    };
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const signal of signals) process.on(signal, forward);
    const done = (code) => {
      for (const signal of signals) process.off(signal, forward);
      const left = reportLeftovers(label, temp.finish({ expected }));
      resolve(code || stopped ? code || 1 : left && strict ? 1 : 0);
    };
    child.on('error', (e) => {
      console.error(`${command}: ${e.message}`);
      done(1);
    });
    child.on('exit', (code, signal) => done(signal ? 1 : (code ?? 1)));
  });
}
