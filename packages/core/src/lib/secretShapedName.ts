/** Names that read like a secret, and the prefixes of cloud and model providers' credentials. */
const SECRET_SHAPED =
  /TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|(^|_)PASS(_|$)|CREDENTIAL|PRIVATE|AUTH|COOKIE|APIKEY|(^|_)(KEY|PAT|DSN)(_|$)|_PWD$|^(AWS|GCP|GCLOUD|GOOGLE|AZURE|ARM|ANTHROPIC|CLAUDE|OPENAI|GH|GITHUB|GITLAB|HF|STRIPE|VAULT|DOCKER|KUBE\w*|SSH|GPG)_|^NPM_(?!CONFIG_|PACKAGE_|LIFECYCLE_|EXECPATH$|NODE_EXECPATH$|COMMAND$)/i;

/** Whether a variable's name reads like a credential: such a name reaches a check only when the person names it exactly. */
export const secretShapedName = (name: string) => SECRET_SHAPED.test(name);
