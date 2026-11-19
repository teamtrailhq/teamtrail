import type { RepoFiles } from '../model/checkScreening';
import type { CiHint, Need } from '../model/repoProfile';
import { ciCommandLines } from './ciCommandLines';
import { ciEnvNames } from './ciEnvNames';
import { imageService } from './imageService';
import { PROFILE_LIMITS } from './limits';
import { secretShaped } from './secretShaped';
import type { FolderView, ProfileReader } from './types';

const WORKFLOWS = '.github/workflows';
const MAX_FILES = 10;
/** One command and its words: no shell syntax (pipes, `&&`, quotes, variables, globs, redirects). */
const SIMPLE = /^[\w./@:=,+%-]+(\s+[\w./@:=,+%-]+)*$/;
const NOT_A_CHECK = new Set(['cd', 'export', 'echo', 'set', 'source', 'mkdir', 'rm', 'cp', 'mv', 'ls', 'cat', 'sudo']);

/** The CI files to read: GitHub Actions workflows (when the folder can be listed) and .gitlab-ci.yml. */
async function ciFiles(files: RepoFiles, top: FolderView, reader: ProfileReader): Promise<string[]> {
  const out: string[] = [];
  const entries = files.list ? await files.list(WORKFLOWS).catch(() => undefined) : undefined;
  const workflows = (entries ?? []).filter((e) => e.kind === 'file' && /\.ya?ml$/.test(e.name)).map((e) => e.name);
  if (workflows.length) reader.note(`${WORKFLOWS}/ ${workflows.join(',')}`);
  out.push(...workflows.slice(0, MAX_FILES).map((name) => `${WORKFLOWS}/${name}`));
  if (top.files.has('.gitlab-ci.yml')) out.push('.gitlab-ci.yml');
  return out;
}

function hintOf(file: string, line: string): CiHint {
  const words = line.split(/\s+/);
  const simple = SIMPLE.test(line) && !NOT_A_CHECK.has(words[0]);
  return simple ? { file, line, run: words } : { file, line };
}

function needsOf(file: string, text: string): Need[] {
  const out: Need[] = [];
  for (const m of text.matchAll(/^\s*image:\s*["']?([^\s"']+)/gm)) {
    const name = imageService(m[1]);
    if (name) out.push({ kind: 'service', name, why: `${m[1]} in ${file}` });
  }
  for (const v of ciEnvNames(text)) {
    const secret = v.secret || secretShaped(v.name);
    const why = v.secret ? `set from CI secrets in ${file}` : `set in ${file}`;
    out.push({ kind: 'variable', name: v.name, secretShaped: secret, why });
  }
  return out;
}

/**
 * What CI says the team runs, as hints: each command line of its workflows (argv only for a simple one), the services
 * its jobs start, and the variable names it sets. Read as text, never run; at most PROFILE_LIMITS.ci hints.
 */
export async function ciHints(o: { files: RepoFiles; top: FolderView; reader: ProfileReader }) {
  const hints: CiHint[] = [];
  const needs: Need[] = [];
  for (const file of await ciFiles(o.files, o.top, o.reader)) {
    const text = (await o.reader.read(file)) ?? '';
    for (const line of ciCommandLines(text)) {
      if (hints.length >= PROFILE_LIMITS.ci) break;
      if (!hints.some((h) => h.line === line)) hints.push(hintOf(file, line));
    }
    needs.push(...needsOf(file, text));
  }
  return { hints, needs };
}
