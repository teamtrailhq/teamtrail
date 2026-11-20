import { statSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { servicePort } from './servicePort';

const TIMEOUT_MS = 300;

/** Whether something accepts a TCP connection on 127.0.0.1 at `port` within 300 ms. Nothing is sent. */
function connects(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(TIMEOUT_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Docker's socket where Docker Desktop, Colima or the Linux daemon keep it, or DOCKER_HOST set. */
function dockerThere(env: NodeJS.ProcessEnv) {
  if (env.DOCKER_HOST) return true;
  const home = os.homedir();
  const sockets = [
    '/var/run/docker.sock',
    path.join(home, '.docker', 'run', 'docker.sock'),
    path.join(home, '.colima', 'default', 'docker.sock'),
  ];
  return sockets.some((s) => {
    try {
      return statSync(s).isSocket();
    } catch {
      return false;
    }
  });
}

/**
 * Whether a service the tests need answers on this machine: a TCP connect to its default port on 127.0.0.1 only,
 * or Docker's socket. Undefined for a service with no known port: nothing is said about it.
 */
export async function serviceReachable(name: string, env: NodeJS.ProcessEnv): Promise<boolean | undefined> {
  if (name === 'docker') return dockerThere(env);
  const port = servicePort(name);
  return port === undefined ? undefined : connects(port);
}
