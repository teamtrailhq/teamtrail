import os from 'node:os';

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/;

/**
 * Where other devices on the network reach the Lookout, for Settings → Pair a device: none when it listens on this
 * machine only (the default), every network address when it listens on all of them, else the one it was given.
 */
export function lanUrls(host: string, port: number): string[] {
  if (LOOPBACK.test(host)) return [];
  if (host !== '0.0.0.0' && host !== '::') return [`http://${host.includes(':') ? `[${host}]` : host}:${port}/`];
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a!.address}:${port}/`);
}
