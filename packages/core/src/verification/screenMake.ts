import { repoPath } from './repoPath';
import type { Found, ScreenInput } from './screenTypes';

const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile'];
/** Flags whose value is the next word. */
const VALUED = new Set(['-C', '-f', '-I', '-o', '-W', '--directory', '--file', '--makefile', '--include-dir']);

interface MakeArgs {
  dir?: string;
  file?: string;
  target?: string;
}

/** The folder (`-C`), file (`-f`) and first target of a `make` command. */
function makeArgs(args: string[]): MakeArgs {
  const out: MakeArgs = {};
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    const [flag, inline] = a.startsWith('--') ? a.split('=', 2) : [a.slice(0, 2), a.slice(2)];
    if (a.startsWith('-') && VALUED.has(flag)) {
      const value = inline || args[++n];
      if (flag === '-C' || flag === '--directory') out.dir = repoPath(out.dir, value);
      if (flag === '-f' || flag === '--file' || flag === '--makefile') out.file = value;
      continue;
    }
    if (a.startsWith('-') || a.includes('=') || /^\d+$/.test(a)) continue;
    out.target ??= a;
  }
  return out;
}

/** Whether the makefile's text defines the target as a rule (`target:` or `a b target::`). */
function defines(text: string, target: string) {
  for (const m of text.matchAll(/^([^\s#:=][^:=]*?)\s*::?(?!=)/gm)) if (m[1].split(/\s+/).includes(target)) return true;
  return false;
}

/** It may come from elsewhere: an included file or a pattern rule. */
const mayDefineElsewhere = (text: string) => /^-?s?include\s/m.test(text) || /^[^\s#]*%[^:=]*:/m.test(text);

/** `make [target]`: a makefile in the folder, with that target. */
export async function screenMake(i: ScreenInput): Promise<Found[]> {
  const a = makeArgs(i.args);
  const dir = a.dir === undefined ? i.cwd : repoPath(i.cwd, a.dir);
  if (dir === undefined) return [];
  const names = a.file ? [a.file] : MAKEFILES;
  let text: string | undefined;
  let found = '';
  for (const name of names) {
    const rel = repoPath(dir, name);
    text = rel === undefined ? undefined : await i.files.read(rel);
    found = name;
    if (text !== undefined) break;
  }
  const where = dir ? ` in \`${dir}\`` : '';
  if (text === undefined)
    return [{ severity: 'wont-run', text: `No ${a.file ? `\`${a.file}\`` : 'Makefile'}${where}` }];
  if (!a.target || defines(text, a.target)) return [];
  const missing = `No \`${a.target}\` target in ${found}${where}`;
  if (mayDefineElsewhere(text)) return [{ severity: 'unsure', text: `${missing}; it may come from an included file` }];
  return [{ severity: 'wont-run', text: missing }];
}
