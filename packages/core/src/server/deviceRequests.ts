import type { IncomingMessage } from 'node:http';

const fromDevice = new WeakSet<IncomingMessage>();

/**
 * Marks a request as another device's whatever its socket says: the projects hub does this for a browser paired as
 * a `device` (signIn/), so its session never opens what only this machine may do, even over loopback.
 */
export const markFromDevice = (req: IncomingMessage) => void fromDevice.add(req);

/** Whether the hub marked this request as another device's. */
export const markedFromDevice = (req: IncomingMessage) => fromDevice.has(req);
