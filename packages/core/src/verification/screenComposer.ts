import { repoPath } from './repoPath';
import { screenProjectFile } from './screenStacks';
import type { Found, ScreenInput } from './screenTypes';

/** Composer's own commands (and aliases): anything else is a composer.json script, or fails. */
const OWN = new Set(
  (
    'about archive audit browse home bump check-platform-reqs clear-cache clearcache cc config create-project depends ' +
    'why diagnose dump-autoload dumpautoload exec fund global help init install i licenses list outdated prohibits ' +
    'why-not reinstall remove rm require r run-script run search self-update selfupdate show info status suggests ' +
    'update u upgrade validate'
  ).split(' '),
);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The script names of the composer.json in `dir`, or why there are none to read. */
async function scripts(i: Pick<ScreenInput, 'files' | 'cwd'>) {
  const text = await i.files.read(repoPath(i.cwd, 'composer.json') ?? 'composer.json');
  if (text === undefined) return undefined;
  try {
    const raw: unknown = JSON.parse(text);
    return isObj(raw) && isObj(raw.scripts) ? new Set(Object.keys(raw.scripts)) : new Set<string>();
  } catch {
    return 'invalid' as const;
  }
}

/** `composer test`, `composer run-script lint`: a composer.json in the folder, with that script. */
export async function screenComposer(i: ScreenInput): Promise<Found[]> {
  const words = i.args.filter((a) => !a.startsWith('-'));
  const [sub, next] = words;
  if (!sub) return [];
  const isRun = sub === 'run-script' || sub === 'run';
  if (OWN.has(sub) && !isRun) return [];
  const name = isRun ? next : sub;
  const found = await scripts(i);
  const where = i.cwd ? ` in \`${i.cwd}\`` : '';
  if (found === undefined) return (await screenProjectFile('composer', i)) ?? [];
  if (found === 'invalid') return [{ severity: 'wont-run', text: `composer.json${where} isn't valid JSON` }];
  if (!name || found.has(name)) return [];
  return [{ severity: 'wont-run', text: `No \`${name}\` script in composer.json${where}` }];
}
