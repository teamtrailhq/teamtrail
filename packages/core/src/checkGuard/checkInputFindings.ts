import { globMatch } from '../knowledge/knowledge';
import type { GuardFinding } from '../model/checkGuard';
import { configSection } from './configSection';
import { makeReach } from './makeReach';
import { packageJson, type PackageView } from './packageJson';
import { RUNNER_CONFIGS } from './runnerConfigs';
import type { CheckReach, GuardReaders } from './types';

type Texts = [before: string | null | undefined, after: string | null | undefined];
type Found = Omit<GuardFinding, 'check'>;

const base = (f: string) => f.split('/').pop() ?? f;
const dirOf = (f: string) => f.split('/').slice(0, -1).join('/');
/** One folder inside the other: a tool reads config from its folder, the folders above and the packages below. */
const near = (a: string, b: string) => !a || !b || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const unread = (file: string): Found => ({
  kind: 'unread',
  file,
  text: `${file} changed; Teamtrail couldn't read it to compare`,
});

/** The scripts the check runs from this package.json, and the config keys of the tools it runs, that changed. */
function packageFindings(file: string, texts: Texts, reach: CheckReach, tools: string[]): Found[] {
  const [b, a] = texts.map(packageJson);
  if (b === 'invalid' || a === 'invalid') return [{ kind: 'script', file, text: `${file} isn't valid JSON` }];
  const empty: PackageView = { scripts: {}, keys: {} };
  const before = b ?? empty;
  const after = a ?? empty;
  const names = [...(reach.scripts.get(file) ?? [])].sort();
  const scripts = names
    .filter((n) => before.scripts[n] !== after.scripts[n])
    .map((n): Found => ({ kind: 'script', file, text: `${file} scripts.${n} changed` }));
  const keys = tools.flatMap((tool) =>
    (RUNNER_CONFIGS[tool]?.pkgKeys ?? [])
      .filter((k) => before.keys[k] !== after.keys[k])
      .map((k): Found => ({ kind: 'runner-config', file, text: `${file} "${k}" changed (${tool}'s config)` })),
  );
  return [...scripts, ...keys];
}

/** Config files of the tools the check runs: the whole file, or the tool's section of a shared one. */
function configFindings(file: string, texts: Texts, tools: string[]): Found[] {
  const name = base(file);
  const out: Found[] = [];
  for (const tool of tools) {
    const c = RUNNER_CONFIGS[tool];
    if (!c) continue;
    if (c.files.some((r) => r.test(name)))
      out.push({ kind: 'runner-config', file, text: `${file} changed (${tool}'s config)` });
    for (const s of c.sections ?? []) {
      if (!s.file.test(name)) continue;
      const [b, a] = texts.map((t) => configSection(t, s.header));
      if (b !== a) out.push({ kind: 'runner-config', file, text: `${file} changed in ${tool}'s section` });
    }
  }
  return out;
}

function makeFindings(file: string, texts: Texts, targets: Set<string>): Found[] {
  return [...targets]
    .filter((t) => {
      const [b, a] = texts.map((x) => (x == null ? undefined : makeReach(x, t || undefined).relevant));
      return b !== a;
    })
    .map((t) => ({ kind: 'makefile', file, text: `${file} changed for \`make${t ? ` ${t}` : ''}\`` }));
}

/** Tools whose config this file could be: they run in a folder near it. */
const toolsNear = (file: string, reach: CheckReach) =>
  [...reach.tools]
    .filter(([, dirs]) => [...dirs].some((d) => near(dirOf(file), d)))
    .map(([tool]) => tool)
    .sort();

/** Whether reading the file is needed to tell: a shared file, a script list, a makefile. */
function needsText(file: string, reach: CheckReach, tools: string[]) {
  if (reach.scripts.has(file) || reach.makefiles.has(file)) return true;
  if (base(file) === 'package.json') return tools.some((t) => RUNNER_CONFIGS[t]?.pkgKeys?.length);
  return tools.some((t) => RUNNER_CONFIGS[t]?.sections?.some((s) => s.file.test(base(file))));
}

/** What one changed file did to what the check runs. */
async function fileFindings(file: string, reach: CheckReach, read: GuardReaders): Promise<Found[]> {
  const tools = toolsNear(file, reach);
  const out: Found[] = [];
  if (reach.files.has(file)) out.push({ kind: 'named-file', file, text: `${file} changed (the check runs it)` });
  const guard = reach.guards.find((g) => globMatch(g.replace(/^\.\//, ''), file));
  if (guard) out.push({ kind: 'guarded', file, text: `${file} changed (guarded by ${guard})` });
  if (!needsText(file, reach, tools)) return [...out, ...configFindings(file, [null, null], tools)];
  const texts: Texts = [await read.before(file), await read.after(file)];
  // a side that couldn't be read can't be compared: strict, since the guard can't tell it changed nothing
  if (texts[0] === undefined || texts[1] === undefined) return [...out, unread(file)];
  if (base(file) === 'package.json') out.push(...packageFindings(file, texts, reach, tools));
  const targets = reach.makefiles.get(file);
  if (targets) out.push(...makeFindings(file, texts, targets));
  return [...out, ...configFindings(file, texts, tools)];
}

/**
 * The changed files that change what one check runs: its scripts, its tools' config, the files it names, its
 * makefile targets and the trail lead's `guards`. Each finding names the file and what changed in it.
 */
export async function checkInputFindings(o: {
  reach: CheckReach;
  changed: string[];
  read: GuardReaders;
}): Promise<GuardFinding[]> {
  const out: GuardFinding[] = [];
  for (const file of o.changed)
    for (const f of await fileFindings(file, o.reach, o.read)) out.push({ ...f, check: o.reach.check });
  return out;
}
