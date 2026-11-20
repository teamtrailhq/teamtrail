import { repoPath } from '../verification/repoPath';
import { programOf } from './programRules';

/**
 * What a check's program is, by how it's named:
 *   bare     a name with no folder (`pytest`), which the system finds on PATH
 *   tool     a path into one of the repo's own tool folders, inside the repo once the check's folder is applied:
 *            `node_modules/.bin/<x>`, `.venv/bin/<x>` (`.venv/Scripts/<x>` on Windows), `vendor/bin/<x>`, or a build
 *            wrapper committed with the repo (`./gradlew`, `./mvnw`)
 *   file     any other path inside the repo (`scripts/check.sh`, `bin/rails`)
 *   outside  a path that leaves the repo (`/tmp/x/pytest`, `../x/pytest`, `~/bin/jest`)
 * Only `bare` and `tool` can be a check Teamtrail knows by its name; anyone could put a program called `pytest` in any
 * other folder. Pure, from the argv alone: whether a tool folder's links stay in the repo is checked where the check
 * runs (verification/toolPathRefusal.ts).
 */
export type ProgramIdentity =
  | { kind: 'bare'; name: string }
  | { kind: 'tool'; name: string; rel: string }
  | { kind: 'file'; rel: string }
  | { kind: 'outside'; path: string };

const TOOL_FOLDER = /^(?:[^/]+\/)*?(?:node_modules\/\.bin|\.venv\/(?:bin|Scripts)|vendor\/bin)\/([^/]+)$/;
const BUILD_WRAPPER = /^(?:[^/]+\/)*((?:gradlew|mvnw)(?:\.bat|\.cmd)?)$/i;

/** The identity of `argv0` for a check run in `cwd` (repo-relative; the repo's top when absent). */
export function programIdentity(argv0: string, cwd?: string): ProgramIdentity {
  if (!/[\\/]/.test(argv0)) return { kind: 'bare', name: programOf(argv0) };
  // a home folder, a Windows drive or network path: never in the repo, whatever repoPath makes of it
  const elsewhere = /^([\\/~]|[a-zA-Z]:)/.test(argv0);
  const rel = elsewhere ? undefined : repoPath(cwd, argv0);
  if (rel === undefined || rel === '') return { kind: 'outside', path: argv0 };
  const tool = TOOL_FOLDER.exec(rel)?.[1] ?? BUILD_WRAPPER.exec(rel)?.[1];
  if (tool) return { kind: 'tool', name: programOf(tool), rel };
  return { kind: 'file', rel };
}

/** The name a known check may be matched by: a bare program's or a repo tool's; none for any other path. */
export function knownProgram(argv0: string, cwd?: string): string | undefined {
  const id = programIdentity(argv0, cwd);
  return id.kind === 'bare' || id.kind === 'tool' ? id.name : undefined;
}
