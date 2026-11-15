import os from 'node:os';
import { gitConfigValue } from '../evidence/gitConfigValue';
import { personOf, type Person } from '../model/person';

let known: { person?: Person } | undefined;

/**
 * The person at this machine, by their git `user.name` (read from the home folder, so a repo's own config, which an
 * agent can write, never names them). Read once. Undefined when git has none.
 */
export function localPerson(): Person | undefined {
  if (!known) {
    const name = gitConfigValue(os.homedir(), 'user.name');
    known = { person: name ? personOf({ id: `git:${name}`, name }) : undefined };
  }
  return known.person;
}
