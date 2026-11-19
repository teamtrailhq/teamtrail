import { commandsOf } from './commandsOf';

/** Composer's own commands: any other word runs the composer.json script of that name. */
const OWN = new Set(
  (
    'about archive audit browse home bump check-platform-reqs clear-cache clearcache cc config create-project depends ' +
    'why diagnose dump-autoload dumpautoload exec fund global help init install i licenses list outdated prohibits ' +
    'why-not reinstall remove rm require r search self-update selfupdate show info status suggests update u upgrade ' +
    'validate'
  ).split(' '),
);

/** The composer.json script `composer test` or `composer run-script lint` runs, if it runs one. */
export function composerScript(args: string[]): string | undefined {
  const [sub, next] = args.filter((a) => !a.startsWith('-'));
  if (sub === 'run-script' || sub === 'run') return next;
  return sub && !OWN.has(sub) ? sub : undefined;
}

/**
 * The commands one composer.json script line runs: `@php vendor/bin/phpunit` is php, `@composer x` is composer, and
 * `@lint` runs the script named lint.
 */
export function composerCommands(line: string): string[][] {
  return commandsOf(line).map(([first, ...rest]) => {
    if (first === '@php') return ['php', ...rest];
    if (first === '@composer') return ['composer', ...rest];
    if (first?.startsWith('@')) return ['composer', 'run-script', first.slice(1), ...rest];
    return [first, ...rest];
  });
}
