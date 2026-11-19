/**
 * Programs that run a tool from the project's environment, by the subcommand that does it, and their flags that take
 * the next word (so it isn't read as the tool).
 */
const WRAPPERS: Record<string, { sub: string; valued: string[] }> = {
  bundle: { sub: 'exec', valued: ['--gemfile'] },
  poetry: { sub: 'run', valued: ['-C', '--directory', '-P', '--project'] },
  pipenv: { sub: 'run', valued: [] },
  pdm: { sub: 'run', valued: ['-p', '--project'] },
  rye: { sub: 'run', valued: [] },
  composer: { sub: 'exec', valued: ['-d', '--working-dir'] },
  uv: {
    sub: 'run',
    valued: [
      '--extra',
      '--group',
      '--only-group',
      '--no-group',
      '--package',
      '--directory',
      '--project',
      '-p',
      '--python',
      '--with',
      '--with-editable',
      '--with-requirements',
      '--env-file',
      '--index',
      '--default-index',
      '--index-url',
      '--extra-index-url',
      '-f',
      '--find-links',
      '--from',
    ],
  },
};

/**
 * The tool a wrapper runs, as its words: `bundle exec rspec spec/a_spec.rb` → `rspec spec/a_spec.rb`, `uv run
 * --frozen pytest -q` → `pytest -q`. Undefined when the words aren't the wrapper's run form (`bundle install`).
 */
export function wrapperTool(program: string, args: string[]): string[] | undefined {
  const spec = WRAPPERS[program];
  if (!spec) return undefined;
  let subSeen = false;
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (a === '--') return subSeen ? args.slice(n + 1) : undefined;
    if (a.startsWith('-')) {
      if (spec.valued.includes(a)) n++;
      continue;
    }
    if (subSeen) return args.slice(n);
    if (a !== spec.sub) return undefined;
    subSeen = true;
  }
  return undefined;
}
