import { childEnv } from '../lib/childEnv';

const NOWHERE = process.platform === 'win32' ? 'NUL' : '/dev/null';

/**
 * Settings given to every git Teamtrail runs, on the command line, where they win over the repo's own config.
 * A repo's `.git/config` is writable by the agents working in it, and each of these names a command git would
 * run for them: the fsmonitor, hooks (`git worktree add` runs post-checkout), the ssh and proxy commands, the
 * pager and editors, askpass and credential helpers, the `ext::` transport and the signing program.
 */
export const SAFE_CONFIG = [
  'core.fsmonitor=false',
  `core.hooksPath=${NOWHERE}`,
  'core.sshCommand=ssh',
  'core.gitProxy=',
  'core.pager=cat',
  'core.editor=:',
  'sequence.editor=:',
  'core.askPass=',
  'credential.helper=',
  'protocol.ext.allow=never',
  'commit.gpgSign=false',
  'tag.gpgSign=false',
  'gpg.program=gpg',
  'gpg.ssh.program=ssh-keygen',
];

/** `-c name=value` for each safe setting, to put before the git command. */
export const safeConfigArgs = (settings: string[] = SAFE_CONFIG) => settings.flatMap((s) => ['-c', s]);

/** git-lfs as `git lfs install` writes it: the one filter a repo's own config may name. */
const LFS = /^git-lfs (clean|smudge|filter-process)( --skip)?( -- %f)?$/;

/**
 * Overrides that empty every content filter the repo's own config defines (`filter.<name>.clean|smudge|process`,
 * which git runs on status, diff and checkout for files a `.gitattributes` points at them). `listing` is the
 * output of `git config --show-scope -z --get-regexp '^filter\.'`. Filters from the person's global or system
 * config stay: those are theirs.
 */
export function filterOverrides(listing: string): string[] {
  const fields = listing.split('\0');
  const out: string[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const scope = fields[i];
    const [key, ...rest] = fields[i + 1].split('\n');
    const own = scope === 'local' || scope === 'worktree';
    const runs = /\.(clean|smudge|process)$/i.test(key);
    if (own && runs && !LFS.test(rest.join('\n').trim())) out.push(`${key}=`);
  }
  const names = new Set(out.map((o) => o.replace(/\.[^.]+=$/, '')));
  return [...out, ...[...names].map((n) => `${n}.required=false`)];
}

/**
 * The environment git runs in: the allowlist of childEnv.ts (so no GITHUB_TOKEN, no SSH agent, and none of the
 * GIT_* variables that redirect git or name a command), with prompts, pagers and editors switched off. The
 * system config is left on: an agent can't write it, and it is where containers keep `safe.directory`.
 */
export function gitEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...childEnv(source).env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_EDITOR: ':',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    LC_ALL: 'C',
  };
}
