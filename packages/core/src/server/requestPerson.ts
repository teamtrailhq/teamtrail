import type { IncomingMessage } from 'node:http';
import type { Person } from '../model/person';

const people = new WeakMap<IncomingMessage, Person>();

/** Notes who a request is from, when the sign-in in front of the bridge knows (projectsHub.ts sets it). */
export function markPerson(req: IncomingMessage, person: Person | undefined) {
  if (person) people.set(req, person);
}

/** Who a request is from, as the hub marked it; undefined when nobody was named (another device, an older server). */
export const personOfRequest = (req: IncomingMessage) => people.get(req);
