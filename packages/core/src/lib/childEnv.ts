/**
 * The environment Teamtrail gives the commands it starts for a project: checks and git. Allowlist first: a
 * name passes only when it is one of the basics below (or one the person listed, see checkEnv.ts), so a token
 * nobody thought of (NPM_TOKEN, AWS_*, ANTHROPIC_API_KEY, DATABASE_URL, SSH_AUTH_SOCK) never reaches a
 * command a teammate's commit or an agent chose. Names are compared without case, as Windows does.
 */

/** Teamtrail's own credentials and settings: never passed, whoever lists them. */
const OWN =
  /^(GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|LINEAR_API_KEY)$|^(TEAMTRAIL_|SLACK_)/i;

/** Names that read like a secret, and the prefixes of cloud and model providers' credentials. */
const SECRET_SHAPED =
  /TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|(^|_)PASS(_|$)|CREDENTIAL|PRIVATE|AUTH|COOKIE|APIKEY|(^|_)(KEY|PAT|DSN)(_|$)|_PWD$|^(AWS|GCP|GCLOUD|GOOGLE|AZURE|ARM|ANTHROPIC|CLAUDE|OPENAI|GH|GITHUB|GITLAB|HF|STRIPE|VAULT|DOCKER|KUBE\w*|SSH|GPG)_|^NPM_(?!CONFIG_|PACKAGE_|LIFECYCLE_|EXECPATH$|NODE_EXECPATH$|COMMAND$)/i;

/** Shell, locale, terminal and operating-system basics. */
const BASICS = [
  'PATH|HOME|USER|LOGNAME|SHELL|PWD|TMPDIR|TMP|TEMP|TZ|LANG|LANGUAGE|TERM|COLORTERM|TERM_PROGRAM|COLUMNS|LINES',
  'NO_COLOR|FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|DISPLAY|WAYLAND_DISPLAY|HOSTNAME|SHLVL',
  'SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|USERPROFILE|USERNAME|APPDATA|LOCALAPPDATA|PROGRAMDATA|HOMEDRIVE',
  'HOMEPATH|PROGRAMFILES|PROGRAMFILES\\(X86\\)|COMMONPROGRAMFILES|OS|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE',
  // CI, proxies and certificates: what a build behind a company network needs to reach its registry.
  'CI|CONTINUOUS_INTEGRATION|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|ALL_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|CURL_CA_BUNDLE',
  'REQUESTS_CA_BUNDLE|DEBUG|INIT_CWD|MAKEFLAGS|CC|CXX|CFLAGS|CXXFLAGS|LDFLAGS|PKG_CONFIG_PATH|LD_LIBRARY_PATH|SDKROOT',
  // Where toolchains and browsers live.
  'CHROME|CHROME_BIN|CHROME_PATH|BROWSER|JAVA_HOME|GOPATH|GOROOT|GOCACHE|GOMODCACHE|GOFLAGS|CARGO_HOME|RUSTUP_HOME',
  'RUSTFLAGS|VIRTUAL_ENV|GEM_HOME|GEM_PATH|BUNDLE_GEMFILE|BUNDLE_PATH|ANDROID_HOME|ANDROID_SDK_ROOT|DOTNET_ROOT',
  'NVM_DIR|NVM_BIN|VOLTA_HOME|PNPM_HOME|BUN_INSTALL|DENO_DIR|DEVELOPER_DIR|HOMEBREW_PREFIX',
].join('|');
const ALLOWED = new RegExp(
  `^(${BASICS})$|^(LC_|NODE_|npm_config_|npm_package_|npm_lifecycle_|npm_execpath$|npm_node_execpath$|npm_command$|XDG_|COREPACK_|YARN_|PNPM_|FNM_|PYTHON|PYENV_|CONDA_|RBENV_|PLAYWRIGHT_|PUPPETEER_|VITEST_|JEST_|DYLD_)`,
  'i',
);

const PROXY = /^(https?|all|ftp)_proxy$/i;

/** A proxy URL without the user and password it may carry (`http://ada:pw@proxy:3128` → `http://proxy:3128`). */
const withoutUserinfo = (value: string) => value.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/?#]*@/i, '$1');

export interface ChildEnv {
  env: NodeJS.ProcessEnv;
  /** Names that were set and not passed on; never their values. */
  withheld: string[];
}

/** `APP_*` as a pattern, anything else as the exact name. */
function listed(name: string, extra: string[]) {
  const upper = name.toUpperCase();
  const exact = extra.some((e) => e.toUpperCase() === upper);
  if (exact) return true;
  const globs = extra.filter((e) => e.endsWith('*')).map((e) => e.slice(0, -1).toUpperCase());
  return globs.some((prefix) => upper.startsWith(prefix)) && !SECRET_SHAPED.test(name);
}

function passes(name: string, extra: string[]) {
  if (OWN.test(name)) return false;
  if (listed(name, extra)) return true;
  return ALLOWED.test(name) && !SECRET_SHAPED.test(name);
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
    if (passes(name, extra)) env[name] = PROXY.test(name) ? withoutUserinfo(value) : value;
    else withheld.push(name);
  }
  return { env, withheld };
}
