import { existsSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { STATE_DIR } from './stateRecord';

/**
 * Whether Teamtrail has signed any trail state for this project on this machine: the first signed write, or the
 * first acceptance, makes the folder (stateRecord.ts `withStateLock`), and nothing in the repo can remove it. From
 * then on, a trail, a ticket or a decision nobody signed here was added outside Teamtrail and is held for the
 * human; before it (a fresh clone, the upgrade to signed state) the files are adopted as they are.
 */
export function projectSigned(root: string): boolean {
  return existsSync(machineStore(root).file(STATE_DIR));
}
