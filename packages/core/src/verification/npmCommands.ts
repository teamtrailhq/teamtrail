/**
 * npm's own commands and their aliases (npm 10). Anything else after `npm` is an unknown command and fails: scripts
 * other than test, start, stop and restart run only through `npm run`.
 */
export const NPM_COMMANDS = new Set(
  (
    'access adduser audit bugs issues cache ci clean-install ic install-clean isntall-clean completion config c get set ' +
    'dedupe ddp deprecate diff dist-tag docs home doctor edit exec x explain why explore find-dupes fund help hlep ' +
    'help-search hook init create innit install i add in isntall install-ci-test cit it install-test link ln ll la ' +
    'login logout ls list org ogr outdated owner author pack ping pkg prefix profile prune publish query rebuild rb ' +
    'repo restart root run run-script rum urn sbom search find s se shrinkwrap star stars start stop team test t tst ' +
    'token undeprecate uninstall unlink remove rm r un unpublish unstar update up upgrade version verison view info ' +
    'show v whoami'
  ).split(' '),
);
