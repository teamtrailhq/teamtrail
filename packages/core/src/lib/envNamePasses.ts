import { ENV_ALLOWLIST } from './envAllowlist';

/** Teamtrail's own credentials and settings: never passed, whoever lists them. */
const OWN =
  /^(GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|LINEAR_API_KEY)$|^(TEAMTRAIL_|SLACK_)/i;

/** Names that read like a secret, and the prefixes of cloud and model providers' credentials. */
const SECRET_SHAPED =
  /TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|(^|_)PASS(_|$)|CREDENTIAL|PRIVATE|AUTH|COOKIE|APIKEY|(^|_)(KEY|PAT|DSN)(_|$)|_PWD$|^(AWS|GCP|GCLOUD|GOOGLE|AZURE|ARM|ANTHROPIC|CLAUDE|OPENAI|GH|GITHUB|GITLAB|HF|STRIPE|VAULT|DOCKER|KUBE\w*|SSH|GPG)_|^NPM_(?!CONFIG_|PACKAGE_|LIFECYCLE_|EXECPATH$|NODE_EXECPATH$|COMMAND$)/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALLOWED = new RegExp(
  `^(${ENV_ALLOWLIST.names.map(escape).join('|')})$|^(${ENV_ALLOWLIST.prefixes.map(escape).join('|')})`,
  'i',
);

/** `APP_*` as a pattern, anything else as the exact name. */
function listed(name: string, extra: string[]) {
  const upper = name.toUpperCase();
  const exact = extra.some((e) => e.toUpperCase() === upper);
  if (exact) return true;
  const globs = extra.filter((e) => e.endsWith('*')).map((e) => e.slice(0, -1).toUpperCase());
  return globs.some((prefix) => upper.startsWith(prefix)) && !SECRET_SHAPED.test(name);
}

/**
 * Whether a variable of this name reaches a command Teamtrail starts: never Teamtrail's own credentials; a name the
 * person listed in `extra` (an exact name even when it reads like a secret, their decision on their machine; a
 * `PREFIX_*` pattern for what it matches except secret-shaped names); else the allowlist (envAllowlist.ts), minus
 * secret-shaped names. Compared without case, as Windows does.
 */
export function envNamePasses(name: string, extra: string[] = []): boolean {
  if (OWN.test(name)) return false;
  if (listed(name, extra)) return true;
  return ALLOWED.test(name) && !SECRET_SHAPED.test(name);
}
