import { announcementSig } from '../machine/announcementSig';
import { announcementSigned } from '../machine/announcementSigned';

/** What a Lookout signs to prove, to this machine, that it is the process its lock names. */
const WHAT = 'lookout-instance';
export const NONCE_SHAPE = /^[0-9a-f]{32,64}$/;

/** The running Lookout's proof for a nonce: the machine key's signature of its process id and the nonce. */
export const instanceProof = (root: string, instance: number, nonce: string) =>
  announcementSig(root, WHAT, [instance, nonce]);

/** Whether `proof` is this machine's signature of `instance` and `nonce`. */
export const instanceProven = (root: string, instance: number, nonce: string, proof: unknown) =>
  announcementSigned(root, WHAT, [instance, nonce], proof);
