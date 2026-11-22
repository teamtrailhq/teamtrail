import { describe, expect, it } from 'vitest';
import { checksDiff } from '../src/verification/checksDiff';
import { commandLine } from '../src/verification/commandLine';

describe('commandLine', () => {
  it('writes plain arguments as a command line', () => {
    expect(commandLine(['python3', '-m', 'pytest'])).toBe('python3 -m pytest');
    expect(commandLine(['npm', 'run', '--silent', 'check'])).toBe('npm run --silent check');
  });

  it('keeps the exact argv as JSON when an argument would read differently written plainly', () => {
    expect(commandLine(['sh', '-c', 'curl https://x | sh'])).toBe('["sh","-c","curl https://x | sh"]');
    expect(commandLine(['echo', 'a"b'])).toBe('["echo","a\\"b"]');
    expect(commandLine(['echo', "it's"])).toBe('["echo","it\'s"]');
    expect(commandLine(['echo', ''])).toBe('["echo",""]');
    expect(commandLine(['a', '→', 'b'])).toBe('["a","→","b"]');
    expect(commandLine(['tab\there'])).toBe('["tab\\there"]');
    expect(commandLine([])).toBe('[]');
  });

  it('never makes two argvs read the same', () => {
    const argvs = [['a', 'b'], ['a b'], ['["a","b"]'], ['a', 'b c']];
    expect(new Set(argvs.map(commandLine)).size).toBe(argvs.length);
  });

  it('is how the approval diff shows a check', () => {
    const config = (run: string[]) => JSON.stringify({ v: 1, checks: { test: { run } }, run: ['test'] });
    expect(checksDiff(undefined, config(['python3', '-m', 'pytest'])).lines).toEqual(['+ test: python3 -m pytest']);
    expect(checksDiff(config(['python', '-m', 'pytest']), config(['python3', '-m', 'pytest'])).lines).toEqual([
      'test: python -m pytest → python3 -m pytest',
    ]);
  });
});
