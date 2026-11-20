import { envNamePasses } from './envNamePasses';

/**
 * The environment Teamtrail gives the commands it starts for a project: checks and git. Allowlist first: a
 * name passes only when it is on the allowlist (envAllowlist.ts) or one the person listed (checkEnv.ts), so a token
 * nobody thought of (NPM_TOKEN, AWS_*, ANTHROPIC_API_KEY, DATABASE_URL, SSH_AUTH_SOCK) never reaches a
 * command a teammate's commit or an agent chose. Names are compared without case, as Windows does.
 */

/** Settings that name a server by URL, which may carry a user and password: passed without them. */
const PROXY = /^((https?|all|ftp)_proxy|goproxy)$/i;

/**
 * A proxy setting without the user and password it may carry, with or without a scheme
 * (`http://ada:pw@proxy:3128` and `ada:pw@proxy:3128` → `proxy:3128` after the scheme). Everything up to the
 * last `@` goes: a password may hold an unencoded `/`, `?`, `#` or `@`, and a proxy URL has no path worth an
 * `@`. Erring that way can only lose a setting, never pass a credential.
 */
function withoutUserinfo(value: string) {
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(value)?.[0] ?? '';
  const rest = value.slice(scheme.length);
  const at = rest.lastIndexOf('@');
  return at === -1 ? value : scheme + rest.slice(at + 1);
}

export interface ChildEnv {
  env: NodeJS.ProcessEnv;
  /** Names that were set and not passed on; never their values. */
  withheld: string[];
}

/**
 * `source` reduced to what a child process may see. `extra` are names the person asked for: an exact name
 * passes even when it reads like a secret (it is their decision, made on their machine); a `PREFIX_*` pattern
 * passes what it matches except secret-shaped names. Teamtrail's own credentials never pass.
 */
export function childEnv(source: NodeJS.ProcessEnv, extra: string[] = []): ChildEnv {
  const env: NodeJS.ProcessEnv = {};
  const withheld: string[] = [];
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (envNamePasses(name, extra)) env[name] = PROXY.test(name) ? withoutUserinfo(value) : value;
    else withheld.push(name);
  }
  return { env, withheld };
}
